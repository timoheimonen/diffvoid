'use strict';

class FakeEventTarget {
    constructor() {
        this._listeners = new Map();
    }

    addEventListener(type, listener) {
        if (!listener) return;
        const listeners = this._listeners.get(type) || [];
        if (!listeners.includes(listener)) listeners.push(listener);
        this._listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        const listeners = this._listeners.get(type);
        if (!listeners) return;
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
        if (!listeners.length) this._listeners.delete(type);
    }

    dispatchEvent(event) {
        if (!event || !event.type) throw new TypeError('Fake events need a type');
        if (!event.target) event.target = this;
        event.currentTarget = this;
        const listeners = (this._listeners.get(event.type) || []).slice();
        for (const listener of listeners) {
            listener.call(this, event);
            if (event._immediateStopped) break;
        }
        if (event.bubbles && !event._stopped && this.parentNode) {
            this.parentNode.dispatchEvent(event);
        }
        return !event.defaultPrevented;
    }

    listenerCount(type) {
        if (type) return (this._listeners.get(type) || []).length;
        let count = 0;
        for (const listeners of this._listeners.values()) count += listeners.length;
        return count;
    }
}

class FakeEvent {
    constructor(type, init) {
        Object.assign(this, init || {});
        this.type = type;
        this.bubbles = !!this.bubbles;
        this.defaultPrevented = false;
        this._stopped = false;
        this._immediateStopped = false;
    }

    preventDefault() {
        this.defaultPrevented = true;
    }

    stopPropagation() {
        this._stopped = true;
    }

    stopImmediatePropagation() {
        this._stopped = true;
        this._immediateStopped = true;
    }
}

class FakeClassList {
    constructor(element) {
        this.element = element;
    }

    _values() {
        const value = this.element.attributes.get('class') || '';
        return value.split(/\s+/).filter(Boolean);
    }

    _write(values) {
        if (values.length) {
            this.element.attributes.set('class', values.join(' '));
        } else {
            this.element.attributes.delete('class');
        }
    }

    add(...tokens) {
        const values = this._values();
        for (const token of tokens) {
            if (token && !values.includes(token)) values.push(token);
        }
        this._write(values);
    }

    remove(...tokens) {
        const removed = new Set(tokens);
        this._write(this._values().filter(function (value) { return !removed.has(value); }));
    }

    contains(token) {
        return this._values().includes(token);
    }

    toggle(token, force) {
        const present = this.contains(token);
        const shouldAdd = force === undefined ? !present : !!force;
        if (shouldAdd) this.add(token);
        else this.remove(token);
        return shouldAdd;
    }

    toString() {
        return this._values().join(' ');
    }
}

class FakeStyle {
    setProperty(name, value) {
        this[name] = String(value);
    }

    removeProperty(name) {
        const previous = this[name] || '';
        delete this[name];
        return previous;
    }
}

class FakeNode extends FakeEventTarget {
    constructor(ownerDocument, nodeType) {
        super();
        this.ownerDocument = ownerDocument || null;
        this.nodeType = nodeType;
        this.parentNode = null;
        this.childNodes = [];
    }

    appendChild(node) {
        if (!node) throw new TypeError('Cannot append an empty node');
        if (node.nodeType === 11) {
            while (node.childNodes.length) this.appendChild(node.childNodes[0]);
            return node;
        }
        if (node.parentNode) node.parentNode.removeChild(node);
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    removeChild(node) {
        const index = this.childNodes.indexOf(node);
        if (index === -1) throw new Error('Node is not a child');
        this.childNodes.splice(index, 1);
        node.parentNode = null;
        return node;
    }

    replaceChildren(...nodes) {
        while (this.childNodes.length) this.removeChild(this.childNodes[0]);
        for (const node of nodes) this.appendChild(node);
    }

    contains(node) {
        if (node === this) return true;
        for (const child of this.childNodes) {
            if (child.contains(node)) return true;
        }
        return false;
    }

    get parentElement() {
        return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }

    get children() {
        return this.childNodes.filter(function (node) { return node.nodeType === 1; });
    }

    get firstChild() {
        return this.childNodes[0] || null;
    }

    get textContent() {
        return this.childNodes.map(function (node) { return node.textContent; }).join('');
    }

    set textContent(value) {
        this.replaceChildren();
        const text = String(value == null ? '' : value);
        if (text) this.appendChild(this.ownerDocument.createTextNode(text));
    }
}

class FakeText extends FakeNode {
    constructor(ownerDocument, value) {
        super(ownerDocument, 3);
        this.nodeValue = String(value);
    }

    get textContent() {
        return this.nodeValue;
    }

    set textContent(value) {
        this.nodeValue = String(value == null ? '' : value);
    }

    contains(node) {
        return node === this;
    }
}

function selectorMatches(element, selector) {
    if (!element || element.nodeType !== 1) return false;
    let rest = selector.trim();
    let tag = null;
    const tagMatch = rest.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
    if (tagMatch) {
        tag = tagMatch[0].toUpperCase();
        rest = rest.slice(tagMatch[0].length);
    }
    if (tag && element.tagName !== tag) return false;

    const classMatches = Array.from(rest.matchAll(/\.([a-zA-Z0-9_-]+)/g));
    for (const match of classMatches) {
        if (!element.classList.contains(match[1])) return false;
    }

    const attributeMatches = Array.from(rest.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g));
    for (const match of attributeMatches) {
        if (!element.hasAttribute(match[1])) return false;
        if (match[2] !== undefined && element.getAttribute(match[1]) !== match[2]) return false;
    }

    if (!tag && !classMatches.length && !attributeMatches.length) return false;
    return true;
}

class FakeElement extends FakeNode {
    constructor(ownerDocument, tagName) {
        super(ownerDocument, 1);
        this.tagName = String(tagName).toUpperCase();
        this.nodeName = this.tagName;
        this.attributes = new Map();
        this.classList = new FakeClassList(this);
        this.style = new FakeStyle();
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.clientHeight = 0;
        this.clientWidth = 0;
        this.disabled = false;
        this._rect = null;
    }

    setAttribute(name, value) {
        this.attributes.set(String(name), String(value));
    }

    getAttribute(name) {
        const key = String(name);
        return this.attributes.has(key) ? this.attributes.get(key) : null;
    }

    hasAttribute(name) {
        return this.attributes.has(String(name));
    }

    removeAttribute(name) {
        this.attributes.delete(String(name));
    }

    get className() {
        return this.getAttribute('class') || '';
    }

    set className(value) {
        this.setAttribute('class', value);
    }

    get id() {
        return this.getAttribute('id') || '';
    }

    set id(value) {
        this.setAttribute('id', value);
    }

    focus() {
        this.ownerDocument.activeElement = this;
    }

    blur() {
        if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
    }

    getBoundingClientRect() {
        return this._rect || {
            top: 0,
            left: 0,
            right: this.clientWidth,
            bottom: this.clientHeight,
            width: this.clientWidth,
            height: this.clientHeight
        };
    }

    setBoundingClientRect(rect) {
        this._rect = Object.assign({}, rect);
    }

    setPointerCapture() {}

    releasePointerCapture() {}

    matches(selector) {
        return selectorMatches(this, selector);
    }

    closest(selector) {
        let current = this;
        while (current && current.nodeType === 1) {
            if (selectorMatches(current, selector)) return current;
            current = current.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        const matches = [];
        function visit(node) {
            for (const child of node.childNodes) {
                if (selectorMatches(child, selector)) matches.push(child);
                visit(child);
            }
        }
        visit(this);
        return matches;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    click() {
        if (this.disabled) return;
        this.dispatchEvent(new FakeEvent('click', { bubbles: true }));
    }
}

class FakeDocumentFragment extends FakeNode {
    constructor(ownerDocument) {
        super(ownerDocument, 11);
    }
}

class FakeDocument extends FakeEventTarget {
    constructor() {
        super();
        this.nodeType = 9;
        this.parentNode = null;
        this.activeElement = null;
        this.body = new FakeElement(this, 'body');
        this.body.parentNode = this;
    }

    createElement(tagName) {
        return new FakeElement(this, tagName);
    }

    createTextNode(value) {
        return new FakeText(this, value);
    }

    createDocumentFragment() {
        return new FakeDocumentFragment(this);
    }

    contains(node) {
        return this.body.contains(node);
    }
}

function createFakeAnimationFrame() {
    let nextId = 1;
    const callbacks = new Map();
    let time = 0;

    return {
        requestAnimationFrame(callback) {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancelAnimationFrame(id) {
            callbacks.delete(id);
        },
        flushOne(step) {
            const first = callbacks.entries().next();
            if (first.done) return false;
            const id = first.value[0];
            const callback = first.value[1];
            callbacks.delete(id);
            time += step === undefined ? 16 : step;
            callback(time);
            return true;
        },
        flushAll(limit) {
            const maximum = limit === undefined ? 1000 : limit;
            let count = 0;
            while (callbacks.size) {
                if (count++ >= maximum) throw new Error('Animation-frame queue did not settle');
                this.flushOne();
            }
            return count;
        },
        get size() {
            return callbacks.size;
        },
        now() {
            return time;
        }
    };
}

function createClipboardData() {
    const values = new Map();
    return {
        setData(type, value) {
            values.set(type, String(value));
        },
        getData(type) {
            return values.get(type) || '';
        }
    };
}

function countDescendants(node) {
    let count = 0;
    for (const child of node.childNodes || []) {
        count++;
        count += countDescendants(child);
    }
    return count;
}

module.exports = {
    FakeDocument,
    FakeElement,
    FakeEvent,
    createFakeAnimationFrame,
    createClipboardData,
    countDescendants
};
