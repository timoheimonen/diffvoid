// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

(function (root) {
    'use strict';

    const PROTOCOL_VERSION = 2;
    const DEFAULT_WORKER_URL = 'worker.js';
    const DEFAULT_STARTUP_TIMEOUT_MS = 2000;
    const DEFAULT_HARD_TIMEOUT_MS = 15000;
    const WORKER_REQUIRED_MESSAGE = 'This comparison requires Web Worker support. Serve the application over HTTP or compare smaller sections.';

    function noop() {}

    function createDiffController(options) {
        options = options || {};

        const WorkerCtor = Object.prototype.hasOwnProperty.call(options, 'WorkerCtor')
            ? options.WorkerCtor
            : root.Worker;
        const timerSource = options.timers || root;
        const setTimer = typeof timerSource.setTimeout === 'function'
            ? timerSource.setTimeout.bind(timerSource)
            : null;
        const clearTimer = typeof timerSource.clearTimeout === 'function'
            ? timerSource.clearTimeout.bind(timerSource)
            : null;
        const now = typeof timerSource.now === 'function'
            ? timerSource.now.bind(timerSource)
            : function () {
                if (root.performance && typeof root.performance.now === 'function') {
                    return root.performance.now();
                }
                return Date.now();
            };

        if (!setTimer || !clearTimer) {
            throw new TypeError('Diff controller requires setTimeout and clearTimeout timer functions.');
        }

        const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : noop;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : noop;
        const onResult = typeof options.onResult === 'function' ? options.onResult : noop;
        const onError = typeof options.onError === 'function' ? options.onError : noop;
        const defaultSyncFallback = typeof options.syncFallback === 'function' ? options.syncFallback : null;
        const workerUrl = options.workerUrl || DEFAULT_WORKER_URL;
        const startupTimeoutMs = normalizeTimeout(options.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS);
        const hardTimeoutMs = normalizeTimeout(options.hardTimeoutMs, DEFAULT_HARD_TIMEOUT_MS);
        const visibilitySource = options.visibility || (root.document || null);

        const state = {
            nextJobId: 1,
            inputRevision: 0,
            activeJob: null,
            hidden: readHidden(visibilitySource),
            destroyed: false
        };

        let removeVisibilityListener = null;

        function emitState(job, nextState, extra) {
            const update = {
                state: nextState,
                jobId: job.jobId,
                inputRevision: job.inputRevision
            };
            if (extra) {
                for (const key in extra) {
                    update[key] = extra[key];
                }
            }
            onStateChange(update);
        }

        function isCurrentJob(job) {
            return !!job
                && state.activeJob === job
                && job.jobId === state.activeJob.jobId
                && job.inputRevision === state.inputRevision;
        }

        function messageBelongsToJob(event, message, job) {
            return isCurrentJob(job)
                && !!event
                && event.currentTarget === state.activeJob.worker
                && !!message
                && message.jobId === state.activeJob.jobId
                && message.inputRevision === state.inputRevision;
        }

        function errorEventBelongsToJob(event, job) {
            return isCurrentJob(job)
                && !!event
                && event.currentTarget === state.activeJob.worker
                && job.jobId === state.activeJob.jobId
                && job.inputRevision === state.inputRevision;
        }

        function clearJobTimer(job, kind) {
            const idKey = kind + 'Timer';
            if (job[idKey] !== null) {
                clearTimer(job[idKey]);
                job[idKey] = null;
            }
        }

        function discardJobTimer(job, kind) {
            clearJobTimer(job, kind);
            job[kind + 'Remaining'] = null;
            job[kind + 'Deadline'] = null;
        }

        function armJobTimer(job, kind) {
            if (!isCurrentJob(job) || state.hidden) return;

            const remainingKey = kind + 'Remaining';
            const deadlineKey = kind + 'Deadline';
            const timerKey = kind + 'Timer';
            const remaining = job[remainingKey];
            if (remaining === null || job[timerKey] !== null) return;

            job[deadlineKey] = now() + remaining;
            job[timerKey] = setTimer(function () {
                job[timerKey] = null;
                job[remainingKey] = 0;
                job[deadlineKey] = null;
                if (kind === 'startup') {
                    failJob(job, 'WORKER_STARTUP_TIMEOUT', 'The comparison worker did not start in time.');
                } else {
                    failJob(job, 'WORKER_HARD_TIMEOUT', 'The comparison took too long and was stopped.');
                }
            }, remaining);
        }

        function pauseJobTimer(job, kind) {
            const timerKey = kind + 'Timer';
            const remainingKey = kind + 'Remaining';
            const deadlineKey = kind + 'Deadline';
            if (job[timerKey] === null) return;

            job[remainingKey] = Math.max(0, job[deadlineKey] - now());
            clearTimer(job[timerKey]);
            job[timerKey] = null;
            job[deadlineKey] = null;
        }

        function detachAndTerminate(job) {
            discardJobTimer(job, 'startup');
            discardJobTimer(job, 'hard');

            const worker = job.worker;
            if (!worker) return;

            try {
                worker.onmessage = null;
                worker.onerror = null;
                worker.onmessageerror = null;
            } catch (err) {
                // Termination below remains the authoritative cleanup operation.
            }

            try {
                worker.terminate();
            } catch (err) {
                // A worker that already failed may reject a second cleanup attempt.
            }
        }

        function finishJob(job, outcome) {
            if (!isCurrentJob(job)) return false;

            job.state = outcome.state;
            detachAndTerminate(job);
            state.activeJob = null;

            emitState(job, outcome.state, outcome.reason ? { reason: outcome.reason } : null);

            const meta = {
                jobId: job.jobId,
                inputRevision: job.inputRevision,
                mode: job.mode
            };

            if (outcome.state === 'completed') {
                if (outcome.legacy) meta.legacy = true;
                onResult(outcome.model, meta);
            } else if (outcome.state === 'failed') {
                onError({
                    code: outcome.code || 'COMPARISON_FAILED',
                    message: outcome.message || 'Comparison failed.',
                    jobId: job.jobId,
                    inputRevision: job.inputRevision
                });
            }

            return true;
        }

        function failJob(job, code, message) {
            return finishJob(job, {
                state: 'failed',
                code: code,
                message: message
            });
        }

        function markStarted(job) {
            if (!isCurrentJob(job)) return false;
            if (job.state === 'computing') return true;
            if (job.state !== 'starting') return false;

            discardJobTimer(job, 'startup');
            job.state = 'computing';
            emitState(job, 'computing');
            return true;
        }

        function handleWorkerMessage(event, job) {
            const message = event && event.data;
            if (!messageBelongsToJob(event, message, job)) return;

            if (message.type === 'diff:started') {
                markStarted(job);
                return;
            }

            if (message.type === 'diff:progress') {
                if (job.state !== 'computing') return;
                onProgress(message, {
                    jobId: job.jobId,
                    inputRevision: job.inputRevision
                });
                return;
            }

            if (message.type === 'diff:result') {
                finishJob(job, { state: 'completed', model: message.model });
                return;
            }

            if (message.type === 'diff:error') {
                failJob(job, message.code || 'COMPARISON_FAILED', message.message || 'Comparison failed.');
                return;
            }

            // Transitional support for tagged phase-one worker messages. Untagged
            // legacy messages are deliberately rejected by messageBelongsToJob().
            if (message.type === 'computing') {
                if (markStarted(job)) {
                    onProgress(message, {
                        jobId: job.jobId,
                        inputRevision: job.inputRevision,
                        legacy: true
                    });
                }
            } else if (message.type === 'chunk' || message.type === 'diff:chunk') {
                if (job.state !== 'computing') return;
                onProgress(message, {
                    jobId: job.jobId,
                    inputRevision: job.inputRevision,
                    legacy: true
                });
            } else if (message.type === 'done') {
                finishJob(job, { state: 'completed', model: message, legacy: true });
            } else if (message.type === 'error') {
                failJob(job, message.code || 'COMPARISON_FAILED', message.message || 'Comparison failed.');
            } else if (message.type === 'cancelled') {
                finishJob(job, { state: 'cancelled', reason: 'worker-cancelled' });
            }
        }

        function handleWorkerError(event, job, code) {
            if (!errorEventBelongsToJob(event, job)) return;
            if (event && typeof event.preventDefault === 'function') event.preventDefault();

            const message = event && event.message
                ? event.message
                : (job.state === 'starting' ? 'The comparison worker failed to start.' : 'The comparison worker failed.');
            failJob(job, code, message);
        }

        function runCreationFallback(job, request, creationError) {
            const syncFallback = typeof request.syncFallback === 'function'
                ? request.syncFallback
                : defaultSyncFallback;

            if (!request.isSyncSafe || !syncFallback) {
                failJob(job, 'WORKER_UNAVAILABLE', WORKER_REQUIRED_MESSAGE);
                return;
            }

            job.mode = 'sync';
            job.state = 'computing';
            emitState(job, 'computing', { mode: 'sync' });

            let model;
            try {
                model = syncFallback(request.left, request.right, {
                    jobId: job.jobId,
                    inputRevision: job.inputRevision,
                    cause: creationError || null
                });
            } catch (err) {
                failJob(
                    job,
                    err && err.code ? err.code : 'SYNC_COMPARISON_FAILED',
                    err && err.message ? err.message : 'Comparison failed.'
                );
                return;
            }

            finishJob(job, { state: 'completed', model: model });
        }

        function start(request) {
            if (state.destroyed) {
                throw new Error('Diff controller has been destroyed.');
            }
            if (!request || typeof request.left !== 'string' || typeof request.right !== 'string') {
                throw new TypeError('Diff controller start() requires string left and right inputs.');
            }

            cancel({ invalidate: false, reason: 'superseded' });
            state.inputRevision++;

            const job = {
                jobId: state.nextJobId++,
                inputRevision: state.inputRevision,
                worker: null,
                startupTimer: null,
                startupDeadline: null,
                startupRemaining: startupTimeoutMs,
                hardTimer: null,
                hardDeadline: null,
                hardRemaining: hardTimeoutMs,
                state: 'starting',
                mode: 'worker'
            };
            state.activeJob = job;
            emitState(job, 'starting');

            let worker;
            try {
                if (typeof WorkerCtor !== 'function') {
                    throw new Error('Web Worker is unavailable.');
                }
                worker = new WorkerCtor(workerUrl);
            } catch (err) {
                runCreationFallback(job, request, err);
                return { jobId: job.jobId, inputRevision: job.inputRevision };
            }

            if (!worker || typeof worker.postMessage !== 'function') {
                if (worker && typeof worker.terminate === 'function') {
                    try { worker.terminate(); } catch (err) { /* Best effort. */ }
                }
                runCreationFallback(job, request, new Error('Web Worker could not be initialized.'));
                return { jobId: job.jobId, inputRevision: job.inputRevision };
            }

            job.worker = worker;
            worker.onmessage = function (event) {
                handleWorkerMessage(event, job);
            };
            worker.onerror = function (event) {
                handleWorkerError(event, job, job.state === 'starting' ? 'WORKER_STARTUP_ERROR' : 'WORKER_RUNTIME_ERROR');
            };
            worker.onmessageerror = function (event) {
                handleWorkerError(event, job, 'WORKER_MESSAGE_ERROR');
            };

            armJobTimer(job, 'startup');
            armJobTimer(job, 'hard');

            try {
                worker.postMessage({
                    type: 'diff:start',
                    protocolVersion: PROTOCOL_VERSION,
                    jobId: job.jobId,
                    inputRevision: job.inputRevision,
                    left: request.left,
                    right: request.right
                });
            } catch (err) {
                failJob(
                    job,
                    'WORKER_POST_MESSAGE_FAILED',
                    err && err.message ? err.message : 'The comparison worker could not receive the input.'
                );
            }

            return { jobId: job.jobId, inputRevision: job.inputRevision };
        }

        function cancel(cancelOptions) {
            cancelOptions = cancelOptions || {};
            const invalidate = cancelOptions.invalidate !== false;
            const reason = cancelOptions.reason || 'cancelled';
            const job = state.activeJob;

            if (invalidate) state.inputRevision++;
            if (!job) return false;

            job.state = 'cancelled';
            detachAndTerminate(job);
            state.activeJob = null;
            emitState(job, 'cancelled', { reason: reason });
            return true;
        }

        function setVisibility(hidden) {
            const nextHidden = !!hidden;
            if (state.hidden === nextHidden) return;
            state.hidden = nextHidden;

            const job = state.activeJob;
            if (!job) return;

            if (nextHidden) {
                pauseJobTimer(job, 'startup');
                pauseJobTimer(job, 'hard');
            } else {
                armJobTimer(job, 'startup');
                armJobTimer(job, 'hard');
            }
        }

        function getState() {
            const active = state.activeJob;
            return {
                nextJobId: state.nextJobId,
                inputRevision: state.inputRevision,
                hidden: state.hidden,
                destroyed: state.destroyed,
                activeJob: active ? {
                    jobId: active.jobId,
                    inputRevision: active.inputRevision,
                    state: active.state,
                    mode: active.mode
                } : null
            };
        }

        function destroy() {
            if (state.destroyed) return;
            cancel({ invalidate: true, reason: 'destroyed' });
            state.destroyed = true;
            if (removeVisibilityListener) {
                removeVisibilityListener();
                removeVisibilityListener = null;
            }
        }

        removeVisibilityListener = subscribeToVisibility(visibilitySource, function () {
            setVisibility(readHidden(visibilitySource));
        });

        return {
            start: start,
            cancel: cancel,
            invalidate: function () { return cancel({ invalidate: true, reason: 'input-changed' }); },
            setVisibility: setVisibility,
            getState: getState,
            destroy: destroy
        };
    }

    function normalizeTimeout(value, fallback) {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
    }

    function readHidden(source) {
        if (!source) return false;
        if (typeof source.isHidden === 'function') return !!source.isHidden();
        return !!source.hidden;
    }

    function subscribeToVisibility(source, listener) {
        if (!source) return null;

        if (typeof source.subscribe === 'function') {
            const unsubscribe = source.subscribe(listener);
            return typeof unsubscribe === 'function' ? unsubscribe : null;
        }

        if (typeof source.addEventListener === 'function') {
            source.addEventListener('visibilitychange', listener);
            return function () {
                if (typeof source.removeEventListener === 'function') {
                    source.removeEventListener('visibilitychange', listener);
                }
            };
        }

        return null;
    }

    root.createDiffController = createDiffController;
})(typeof globalThis !== 'undefined' ? globalThis : this);
