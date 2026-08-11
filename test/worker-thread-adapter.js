const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const workerThreads = require('node:worker_threads');

const parentPort = workerThreads.parentPort;
const workerData = workerThreads.workerData || {};

if (parentPort) {
    const workerFilename = path.resolve(workerData.workerFilename);
    const workerDirectory = path.dirname(workerFilename);

    globalThis.self = globalThis;

    if (typeof workerData.clockStep === 'number') {
        let currentTime = 0;
        Object.defineProperty(globalThis, 'performance', {
            configurable: true,
            value: {
                now: function () {
                    const value = currentTime;
                    currentTime += workerData.clockStep;
                    return value;
                }
            }
        });
    }

    globalThis.importScripts = function () {
        for (let i = 0; i < arguments.length; i++) {
            const filename = path.resolve(workerDirectory, arguments[i]);
            vm.runInThisContext(fs.readFileSync(filename, 'utf8'), { filename: filename });
        }
    };

    globalThis.self.postMessage = function (message, transferList) {
        const transfers = transferList || [];
        const byteLengthsBefore = transfers.map(function (buffer) { return buffer.byteLength; });

        parentPort.postMessage({
            kind: 'worker-message',
            message: message
        }, transfers);

        if (transfers.length) {
            parentPort.postMessage({
                kind: 'transfer-observation',
                messageType: message && message.type,
                transferCount: transfers.length,
                byteLengthsBefore: byteLengthsBefore,
                byteLengthsAfter: transfers.map(function (buffer) { return buffer.byteLength; })
            });
        }
    };

    try {
        vm.runInThisContext(fs.readFileSync(workerFilename, 'utf8'), { filename: workerFilename });
    } catch (err) {
        parentPort.postMessage({
            kind: 'adapter-error',
            message: err && err.stack ? err.stack : String(err)
        });
    }

    parentPort.on('message', function (message) {
        if (typeof globalThis.self.onmessage === 'function') {
            globalThis.self.onmessage({ data: message, currentTarget: globalThis.self });
        }
    });

    parentPort.postMessage({ kind: 'ready' });
}
