﻿!function (e) { if ("object" == typeof exports && "undefined" != typeof module) module.exports = e(); else if ("function" == typeof define && define.amd) define([], e); else { var f; "undefined" != typeof window ? f = window : "undefined" != typeof global ? f = global : "undefined" != typeof self && (f = self), f.io = e() } }(function () {
    var define, module, exports; return (function e(t, n, r) { function s(o, u) { if (!n[o]) { if (!t[o]) { var a = typeof require == "function" && require; if (!u && a) return a(o, !0); if (i) return i(o, !0); throw new Error("Cannot find module '" + o + "'") } var f = n[o] = { exports: {} }; t[o][0].call(f.exports, function (e) { var n = t[o][1][e]; return s(n ? n : e) }, f, f.exports, e, t, n, r) } return n[o].exports } var i = typeof require == "function" && require; for (var o = 0; o < r.length; o++) s(r[o]); return s })({
        1: [function (_dereq_, module, exports) {

            module.exports = _dereq_('./lib/');

        }, { "./lib/": 2 }], 2: [function (_dereq_, module, exports) {

            /**
             * Module dependencies.
             */

            var url = _dereq_('./url');
            var parser = _dereq_('socket.io-parser');
            var Manager = _dereq_('./manager');
            var debug = _dereq_('debug')('socket.io-client');
            /**
             * Module exports.
             */

            module.exports = exports = lookup;

            /**
             * Managers cache.
             */

            var cache = exports.managers = {};

            /**
             * Looks up an existing `Manager` for multiplexing.
             * If the user summons:
             *
             *   `io('http://localhost/a');`
             *   `io('http://localhost/b');`
             *
             * We reuse the existing instance based on same scheme/port/host,
             * and we initialize sockets for each namespace.
             *
             * @api public
             */

            function lookup(uri, opts) {
                if (typeof uri == 'object') {
                    opts = uri;
                    uri = undefined;
                }

                opts = opts || {};

                var parsed = url(uri);
                var source = parsed.source;
                var id = parsed.id;
                var io;

                if (opts.forceNew || opts['force new connection'] || false === opts.multiplex) {
                    debug('ignoring socket cache for %s', source);
                    io = Manager(source, opts);
                } else {
                    if (!cache[id]) {
                        debug('new io instance for %s', source);
                        cache[id] = Manager(source, opts);
                    }
                    io = cache[id];
                }

                return io.socket(parsed.path);
            }

            /**
             * Protocol version.
             *
             * @api public
             */

            exports.protocol = parser.protocol;

            /**
             * `connect`.
             *
             * @param {String} uri
             * @api public
             */

            exports.connect = lookup;

            /**
             * Expose constructors for standalone build.
             *
             * @api public
             */

            exports.Manager = _dereq_('./manager');
            exports.Socket = _dereq_('./socket');

        }, { "./manager": 3, "./socket": 5, "./url": 6, "debug": 10, "socket.io-parser": 46 }], 3: [function (_dereq_, module, exports) {

            /**
             * Module dependencies.
             */

            var url = _dereq_('./url');
            var eio = _dereq_('engine.io-client');
            var Socket = _dereq_('./socket');
            var Emitter = _dereq_('component-emitter');
            var parser = _dereq_('socket.io-parser');
            var on = _dereq_('./on');
            var bind = _dereq_('component-bind');
            var object = _dereq_('object-component');
            var debug = _dereq_('debug')('socket.io-client:manager');

            var indexOf = _dereq_('indexof');
            var Backoff = _dereq_('backo2');

            /**
             * Module exports
             */

            module.exports = Manager;

            /**
             * `Manager` constructor.
             *
             * @param {String} engine instance or engine uri/opts
             * @param {Object} options
             * @api public
             */

            function Manager(uri, opts) {
                if (!(this instanceof Manager)) return new Manager(uri, opts);
                if (uri && ('object' == typeof uri)) {
                    opts = uri;
                    uri = undefined;
                }
                opts = opts || {};

                opts.path = opts.path || '/socket.io';
                this.nsps = {};
                this.subs = [];
                this.opts = opts;
                this.reconnection(opts.reconnection !== false);
                this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
                this.reconnectionDelay(opts.reconnectionDelay || 1000);
                this.reconnectionDelayMax(opts.reconnectionDelayMax || 5000);
                this.randomizationFactor(opts.randomizationFactor || 0.5);
                this.backoff = new Backoff({
                    min: this.reconnectionDelay(),
                    max: this.reconnectionDelayMax(),
                    jitter: this.randomizationFactor()
                });
                this.timeout(null == opts.timeout ? 20000 : opts.timeout);
                this.readyState = 'closed';
                this.uri = uri;
                this.connected = [];
                this.encoding = false;
                this.packetBuffer = [];
                this.encoder = new parser.Encoder();
                this.decoder = new parser.Decoder();
                this.autoConnect = opts.autoConnect !== false;
                if (this.autoConnect) this.open();
            }

            /**
             * Propagate given event to sockets and emit on `this`
             *
             * @api private
             */

            Manager.prototype.emitAll = function () {
                this.emit.apply(this, arguments);
                for (var nsp in this.nsps) {
                    this.nsps[nsp].emit.apply(this.nsps[nsp], arguments);
                }
            };

            /**
             * Update `socket.id` of all sockets
             *
             * @api private
             */

            Manager.prototype.updateSocketIds = function () {
                for (var nsp in this.nsps) {
                    this.nsps[nsp].id = this.engine.id;
                }
            };

            /**
             * Mix in `Emitter`.
             */

            Emitter(Manager.prototype);

            /**
             * Sets the `reconnection` config.
             *
             * @param {Boolean} true/false if it should automatically reconnect
             * @return {Manager} self or value
             * @api public
             */

            Manager.prototype.reconnection = function (v) {
                if (!arguments.length) return this._reconnection;
                this._reconnection = !!v;
                return this;
            };

            /**
             * Sets the reconnection attempts config.
             *
             * @param {Number} max reconnection attempts before giving up
             * @return {Manager} self or value
             * @api public
             */

            Manager.prototype.reconnectionAttempts = function (v) {
                if (!arguments.length) return this._reconnectionAttempts;
                this._reconnectionAttempts = v;
                return this;
            };

            /**
             * Sets the delay between reconnections.
             *
             * @param {Number} delay
             * @return {Manager} self or value
             * @api public
             */

            Manager.prototype.reconnectionDelay = function (v) {
                if (!arguments.length) return this._reconnectionDelay;
                this._reconnectionDelay = v;
                this.backoff && this.backoff.setMin(v);
                return this;
            };

            Manager.prototype.randomizationFactor = function (v) {
                if (!arguments.length) return this._randomizationFactor;
                this._randomizationFactor = v;
                this.backoff && this.backoff.setJitter(v);
                return this;
            };

            /**
             * Sets the maximum delay between reconnections.
             *
             * @param {Number} delay
             * @return {Manager} self or value
             * @api public
             */

            Manager.prototype.reconnectionDelayMax = function (v) {
                if (!arguments.length) return this._reconnectionDelayMax;
                this._reconnectionDelayMax = v;
                this.backoff && this.backoff.setMax(v);
                return this;
            };

            /**
             * Sets the connection timeout. `false` to disable
             *
             * @return {Manager} self or value
             * @api public
             */

            Manager.prototype.timeout = function (v) {
                if (!arguments.length) return this._timeout;
                this._timeout = v;
                return this;
            };

            /**
             * Starts trying to reconnect if reconnection is enabled and we have not
             * started reconnecting yet
             *
             * @api private
             */

            Manager.prototype.maybeReconnectOnOpen = function () {
                // Only try to reconnect if it's the first time we're connecting
                if (!this.reconnecting && this._reconnection && this.backoff.attempts === 0) {
                    // keeps reconnection from firing twice for the same reconnection loop
                    this.reconnect();
                }
            };


            /**
             * Sets the current transport `socket`.
             *
             * @param {Function} optional, Callback
             * @return {Manager} self
             * @api public
             */

            Manager.prototype.open =
            Manager.prototype.connect = function (fn) {
                debug('readyState %s', this.readyState);
                if (~this.readyState.indexOf('open')) return this;

                debug('opening %s', this.uri);
                this.engine = eio(this.uri, this.opts);
                var socket = this.engine;
                var self = this;
                this.readyState = 'opening';
                this.skipReconnect = false;

                // emit `open`
                var openSub = on(socket, 'open', function () {
                    self.onopen();
                    fn && fn();
                });

                // emit `connect_error`
                var errorSub = on(socket, 'error', function (data) {
                    debug('connect_error');
                    self.cleanup();
                    self.readyState = 'closed';
                    self.emitAll('connect_error', data);
                    if (fn) {
                        var err = new Error('Connection error');
                        err.data = data;
                        fn(err);
                    } else {
                        // Only do this if there is no fn to handle the error
                        self.maybeReconnectOnOpen();
                    }
                });

                // emit `connect_timeout`
                if (false !== this._timeout) {
                    var timeout = this._timeout;
                    debug('connect attempt will timeout after %d', timeout);

                    // set timer
                    var timer = setTimeout(function () {
                        debug('connect attempt timed out after %d', timeout);
                        openSub.destroy();
                        socket.close();
                        socket.emit('error', 'timeout');
                        self.emitAll('connect_timeout', timeout);
                    }, timeout);

                    this.subs.push({
                        destroy: function () {
                            clearTimeout(timer);
                        }
                    });
                }

                this.subs.push(openSub);
                this.subs.push(errorSub);

                return this;
            };

            /**
             * Called upon transport open.
             *
             * @api private
             */

            Manager.prototype.onopen = function () {
                debug('open');

                // clear old subs
                this.cleanup();

                // mark as open
                this.readyState = 'open';
                this.emit('open');

                // add new subs
                var socket = this.engine;
                this.subs.push(on(socket, 'data', bind(this, 'ondata')));
                this.subs.push(on(this.decoder, 'decoded', bind(this, 'ondecoded')));
                this.subs.push(on(socket, 'error', bind(this, 'onerror')));
                this.subs.push(on(socket, 'close', bind(this, 'onclose')));
            };

            /**
             * Called with data.
             *
             * @api private
             */

            Manager.prototype.ondata = function (data) {
                this.decoder.add(data);
            };

            /**
             * Called when parser fully decodes a packet.
             *
             * @api private
             */

            Manager.prototype.ondecoded = function (packet) {
                this.emit('packet', packet);
            };

            /**
             * Called upon socket error.
             *
             * @api private
             */

            Manager.prototype.onerror = function (err) {
                debug('error', err);
                this.emitAll('error', err);
            };

            /**
             * Creates a new socket for the given `nsp`.
             *
             * @return {Socket}
             * @api public
             */

            Manager.prototype.socket = function (nsp) {
                var socket = this.nsps[nsp];
                if (!socket) {
                    socket = new Socket(this, nsp);
                    this.nsps[nsp] = socket;
                    var self = this;
                    socket.on('connect', function () {
                        socket.id = self.engine.id;
                        if (!~indexOf(self.connected, socket)) {
                            self.connected.push(socket);
                        }
                    });
                }
                return socket;
            };

            /**
             * Called upon a socket close.
             *
             * @param {Socket} socket
             */

            Manager.prototype.destroy = function (socket) {
                var index = indexOf(this.connected, socket);
                if (~index) this.connected.splice(index, 1);
                if (this.connected.length) return;

                this.close();
            };

            /**
             * Writes a packet.
             *
             * @param {Object} packet
             * @api private
             */

            Manager.prototype.packet = function (packet) {
                debug('writing packet %j', packet);
                var self = this;

                if (!self.encoding) {
                    // encode, then write to engine with result
                    self.encoding = true;
                    this.encoder.encode(packet, function (encodedPackets) {
                        for (var i = 0; i < encodedPackets.length; i++) {
                            self.engine.write(encodedPackets[i]);
                        }
                        self.encoding = false;
                        self.processPacketQueue();
                    });
                } else { // add packet to the queue
                    self.packetBuffer.push(packet);
                }
            };

            /**
             * If packet buffer is non-empty, begins encoding the
             * next packet in line.
             *
             * @api private
             */

            Manager.prototype.processPacketQueue = function () {
                if (this.packetBuffer.length > 0 && !this.encoding) {
                    var pack = this.packetBuffer.shift();
                    this.packet(pack);
                }
            };

            /**
             * Clean up transport subscriptions and packet buffer.
             *
             * @api private
             */

            Manager.prototype.cleanup = function () {
                var sub;
                while (sub = this.subs.shift()) sub.destroy();

                this.packetBuffer = [];
                this.encoding = false;

                this.decoder.destroy();
            };

            /**
             * Close the current socket.
             *
             * @api private
             */

            Manager.prototype.close =
            Manager.prototype.disconnect = function () {
                this.skipReconnect = true;
                this.backoff.reset();
                this.readyState = 'closed';
                this.engine && this.engine.close();
            };

            /**
             * Called upon engine close.
             *
             * @api private
             */

            Manager.prototype.onclose = function (reason) {
                debug('close');
                this.cleanup();
                this.backoff.reset();
                this.readyState = 'closed';
                this.emit('close', reason);
                if (this._reconnection && !this.skipReconnect) {
                    this.reconnect();
                }
            };

            /**
             * Attempt a reconnection.
             *
             * @api private
             */

            Manager.prototype.reconnect = function () {
                if (this.reconnecting || this.skipReconnect) return this;

                var self = this;

                if (this.backoff.attempts >= this._reconnectionAttempts) {
                    debug('reconnect failed');
                    this.backoff.reset();
                    this.emitAll('reconnect_failed');
                    this.reconnecting = false;
                } else {
                    var delay = this.backoff.duration();
                    debug('will wait %dms before reconnect attempt', delay);

                    this.reconnecting = true;
                    var timer = setTimeout(function () {
                        if (self.skipReconnect) return;

                        debug('attempting reconnect');
                        self.emitAll('reconnect_attempt', self.backoff.attempts);
                        self.emitAll('reconnecting', self.backoff.attempts);

                        // check again for the case socket closed in above events
                        if (self.skipReconnect) return;

                        self.open(function (err) {
                            if (err) {
                                debug('reconnect attempt error');
                                self.reconnecting = false;
                                self.reconnect();
                                self.emitAll('reconnect_error', err.data);
                            } else {
                                debug('reconnect success');
                                self.onreconnect();
                            }
                        });
                    }, delay);

                    this.subs.push({
                        destroy: function () {
                            clearTimeout(timer);
                        }
                    });
                }
            };

            /**
             * Called upon successful reconnect.
             *
             * @api private
             */

            Manager.prototype.onreconnect = function () {
                var attempt = this.backoff.attempts;
                this.reconnecting = false;
                this.backoff.reset();
                this.updateSocketIds();
                this.emitAll('reconnect', attempt);
            };

        }, { "./on": 4, "./socket": 5, "./url": 6, "backo2": 7, "component-bind": 8, "component-emitter": 9, "debug": 10, "engine.io-client": 11, "indexof": 42, "object-component": 43, "socket.io-parser": 46 }], 4: [function (_dereq_, module, exports) {

            /**
             * Module exports.
             */

            module.exports = on;

            /**
             * Helper for subscriptions.
             *
             * @param {Object|EventEmitter} obj with `Emitter` mixin or `EventEmitter`
             * @param {String} event name
             * @param {Function} Callback
             * @api public
             */

            function on(obj, ev, fn) {
                obj.on(ev, fn);
                return {
                    destroy: function () {
                        obj.removeListener(ev, fn);
                    }
                };
            }

        }, {}], 5: [function (_dereq_, module, exports) {

            /**
             * Module dependencies.
             */

            var parser = _dereq_('socket.io-parser');
            var Emitter = _dereq_('component-emitter');
            var toArray = _dereq_('to-array');
            var on = _dereq_('./on');
            var bind = _dereq_('component-bind');
            var debug = _dereq_('debug')('socket.io-client:socket');

            var hasBin = _dereq_('has-binary');

            /**
             * Module exports.
             */

            module.exports = exports = Socket;

            /**
             * Internal events (blacklisted).
             * These events can't be emitted by the user.
             *
             * @api private
             */

            var events = {
                connect: 1,
                connect_error: 1,
                connect_timeout: 1,
                disconnect: 1,
                error: 1,
                reconnect: 1,
                reconnect_attempt: 1,
                reconnect_failed: 1,
                reconnect_error: 1,
                reconnecting: 1
            };

            /**
             * Shortcut to `Emitter#emit`.
             */

            var emit = Emitter.prototype.emit;

            /**
             * `Socket` constructor.
             *
             * @api public
             */

            function Socket(io, nsp) {
                this.io = io;
                this.nsp = nsp;
                this.json = this; // compat
                this.ids = 0;
                this.acks = {};
                if (this.io.autoConnect) this.open();
                this.receiveBuffer = [];
                this.sendBuffer = [];
                this.connected = false;
                this.disconnected = true;
            }

            /**
             * Mix in `Emitter`.
             */

            Emitter(Socket.prototype);

            /**
             * Subscribe to open, close and packet events
             *
             * @api private
             */

            Socket.prototype.subEvents = function () {
                if (this.subs) return;

                var io = this.io;
                this.subs = [
                  on(io, 'open', bind(this, 'onopen')),
                  on(io, 'packet', bind(this, 'onpacket')),
                  on(io, 'close', bind(this, 'onclose'))
                ];
            };

            /**
             * "Opens" the socket.
             *
             * @api public
             */

            Socket.prototype.open =
            Socket.prototype.connect = function () {
                if (this.connected) return this;

                this.subEvents();
                this.io.open(); // ensure open
                if ('open' == this.io.readyState) this.onopen();
                return this;
            };

            /**
             * Sends a `message` event.
             *
             * @return {Socket} self
             * @api public
             */

            Socket.prototype.send = function () {
                var args = toArray(arguments);
                args.unshift('message');
                this.emit.apply(this, args);
                return this;
            };

            /**
             * Override `emit`.
             * If the event is in `events`, it's emitted normally.
             *
             * @param {String} event name
             * @return {Socket} self
             * @api public
             */

            Socket.prototype.emit = function (ev) {
                if (events.hasOwnProperty(ev)) {
                    emit.apply(this, arguments);
                    return this;
                }

                var args = toArray(arguments);
                var parserType = parser.EVENT; // default
                if (hasBin(args)) { parserType = parser.BINARY_EVENT; } // binary
                var packet = { type: parserType, data: args };

                // event ack Callback
                if ('function' == typeof args[args.length - 1]) {
                    debug('emitting packet with ack id %d', this.ids);
                    this.acks[this.ids] = args.pop();
                    packet.id = this.ids++;
                }

                if (this.connected) {
                    this.packet(packet);
                } else {
                    this.sendBuffer.push(packet);
                }

                return this;
            };

            /**
             * Sends a packet.
             *
             * @param {Object} packet
             * @api private
             */

            Socket.prototype.packet = function (packet) {
                packet.nsp = this.nsp;
                this.io.packet(packet);
            };

            /**
             * Called upon engine `open`.
             *
             * @api private
             */

            Socket.prototype.onopen = function () {
                debug('transport is open - connecting');

                // write connect packet if necessary
                if ('/' != this.nsp) {
                    this.packet({ type: parser.CONNECT });
                }
            };

            /**
             * Called upon engine `close`.
             *
             * @param {String} reason
             * @api private
             */

            Socket.prototype.onclose = function (reason) {
                debug('close (%s)', reason);
                this.connected = false;
                this.disconnected = true;
                delete this.id;
                this.emit('disconnect', reason);
            };

            /**
             * Called with socket packet.
             *
             * @param {Object} packet
             * @api private
             */

            Socket.prototype.onpacket = function (packet) {
                if (packet.nsp != this.nsp) return;

                switch (packet.type) {
                    case parser.CONNECT:
                        this.onconnect();
                        break;

                    case parser.EVENT:
                        this.onevent(packet);
                        break;

                    case parser.BINARY_EVENT:
                        this.onevent(packet);
                        break;

                    case parser.ACK:
                        this.onack(packet);
                        break;

                    case parser.BINARY_ACK:
                        this.onack(packet);
                        break;

                    case parser.DISCONNECT:
                        this.ondisconnect();
                        break;

                    case parser.ERROR:
                        this.emit('error', packet.data);
                        break;
                }
            };

            /**
             * Called upon a server event.
             *
             * @param {Object} packet
             * @api private
             */

            Socket.prototype.onevent = function (packet) {
                var args = packet.data || [];
                debug('emitting event %j', args);

                if (null != packet.id) {
                    debug('attaching ack Callback to event');
                    args.push(this.ack(packet.id));
                }

                if (this.connected) {
                    emit.apply(this, args);
                } else {
                    this.receiveBuffer.push(args);
                }
            };

            /**
             * Produces an ack Callback to emit with an event.
             *
             * @api private
             */

            Socket.prototype.ack = function (id) {
                var self = this;
                var sent = false;
                return function () {
                    // prevent double Callbacks
                    if (sent) return;
                    sent = true;
                    var args = toArray(arguments);
                    debug('sending ack %j', args);

                    var type = hasBin(args) ? parser.BINARY_ACK : parser.ACK;
                    self.packet({
                        type: type,
                        id: id,
                        data: args
                    });
                };
            };

            /**
             * Called upon a server acknowlegement.
             *
             * @param {Object} packet
             * @api private
             */

            Socket.prototype.onack = function (packet) {
                debug('calling ack %s with %j', packet.id, packet.data);
                var fn = this.acks[packet.id];
                fn.apply(this, packet.data);
                delete this.acks[packet.id];
            };

            /**
             * Called upon server connect.
             *
             * @api private
             */

            Socket.prototype.onconnect = function () {
                this.connected = true;
                this.disconnected = false;
                this.emit('connect');
                this.emitBuffered();
            };

            /**
             * Emit buffered events (received and emitted).
             *
             * @api private
             */

            Socket.prototype.emitBuffered = function () {
                var i;
                for (i = 0; i < this.receiveBuffer.length; i++) {
                    emit.apply(this, this.receiveBuffer[i]);
                }
                this.receiveBuffer = [];

                for (i = 0; i < this.sendBuffer.length; i++) {
                    this.packet(this.sendBuffer[i]);
                }
                this.sendBuffer = [];
            };

            /**
             * Called upon server disconnect.
             *
             * @api private
             */

            Socket.prototype.ondisconnect = function () {
                debug('server disconnect (%s)', this.nsp);
                this.destroy();
                this.onclose('io server disconnect');
            };

            /**
             * Called upon forced client/server side disconnections,
             * this method ensures the manager stops tracking us and
             * that reconnections don't get triggered for this.
             *
             * @api private.
             */

            Socket.prototype.destroy = function () {
                if (this.subs) {
                    // clean subscriptions to avoid reconnections
                    for (var i = 0; i < this.subs.length; i++) {
                        this.subs[i].destroy();
                    }
                    this.subs = null;
                }

                this.io.destroy(this);
            };

            /**
             * Disconnects the socket manually.
             *
             * @return {Socket} self
             * @api public
             */

            Socket.prototype.close =
            Socket.prototype.disconnect = function () {
                if (this.connected) {
                    debug('performing disconnect (%s)', this.nsp);
                    this.packet({ type: parser.DISCONNECT });
                }

                // remove socket from pool
                this.destroy();

                if (this.connected) {
                    // fire events
                    this.onclose('io client disconnect');
                }
                return this;
            };

        }, { "./on": 4, "component-bind": 8, "component-emitter": 9, "debug": 10, "has-binary": 38, "socket.io-parser": 46, "to-array": 50 }], 6: [function (_dereq_, module, exports) {
            (function (global) {

                /**
                 * Module dependencies.
                 */

                var parseuri = _dereq_('parseuri');
                var debug = _dereq_('debug')('socket.io-client:url');

                /**
                 * Module exports.
                 */

                module.exports = url;

                /**
                 * URL parser.
                 *
                 * @param {String} url
                 * @param {Object} An object meant to mimic window.location.
                 *                 Defaults to window.location.
                 * @api public
                 */

                function url(uri, loc) {
                    var obj = uri;

                    // default to window.location
                    var loc = loc || global.location;
                    if (null == uri) uri = loc.protocol + '//' + loc.host;

                    // relative path support
                    if ('string' == typeof uri) {
                        if ('/' == uri.charAt(0)) {
                            if ('/' == uri.charAt(1)) {
                                uri = loc.protocol + uri;
                            } else {
                                uri = loc.hostname + uri;
                            }
                        }

                        if (!/^(https?|wss?):\/\//.test(uri)) {
                            debug('protocol-less url %s', uri);
                            if ('undefined' != typeof loc) {
                                uri = loc.protocol + '//' + uri;
                            } else {
                                uri = 'https://' + uri;
                            }
                        }

                        // parse
                        debug('parse %s', uri);
                        obj = parseuri(uri);
                    }

                    // make sure we treat `localhost:80` and `localhost` equally
                    if (!obj.port) {
                        if (/^(http|ws)$/.test(obj.protocol)) {
                            obj.port = '80';
                        }
                        else if (/^(http|ws)s$/.test(obj.protocol)) {
                            obj.port = '443';
                        }
                    }

                    obj.path = obj.path || '/';

                    // define unique id
                    obj.id = obj.protocol + '://' + obj.host + ':' + obj.port;
                    // define href
                    obj.href = obj.protocol + '://' + obj.host + (loc && loc.port == obj.port ? '' : (':' + obj.port));

                    return obj;
                }

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "debug": 10, "parseuri": 44 }], 7: [function (_dereq_, module, exports) {

            /**
             * Expose `Backoff`.
             */

            module.exports = Backoff;

            /**
             * Initialize backoff timer with `opts`.
             *
             * - `min` initial timeout in milliseconds [100]
             * - `max` max timeout [10000]
             * - `jitter` [0]
             * - `factor` [2]
             *
             * @param {Object} opts
             * @api public
             */

            function Backoff(opts) {
                opts = opts || {};
                this.ms = opts.min || 100;
                this.max = opts.max || 10000;
                this.factor = opts.factor || 2;
                this.jitter = opts.jitter > 0 && opts.jitter <= 1 ? opts.jitter : 0;
                this.attempts = 0;
            }

            /**
             * Return the backoff duration.
             *
             * @return {Number}
             * @api public
             */

            Backoff.prototype.duration = function () {
                var ms = this.ms * Math.pow(this.factor, this.attempts++);
                if (this.jitter) {
                    var rand = Math.random();
                    var deviation = Math.floor(rand * this.jitter * ms);
                    ms = (Math.floor(rand * 10) & 1) == 0 ? ms - deviation : ms + deviation;
                }
                return Math.min(ms, this.max) | 0;
            };

            /**
             * Reset the number of attempts.
             *
             * @api public
             */

            Backoff.prototype.reset = function () {
                this.attempts = 0;
            };

            /**
             * Set the minimum duration
             *
             * @api public
             */

            Backoff.prototype.setMin = function (min) {
                this.ms = min;
            };

            /**
             * Set the maximum duration
             *
             * @api public
             */

            Backoff.prototype.setMax = function (max) {
                this.max = max;
            };

            /**
             * Set the jitter
             *
             * @api public
             */

            Backoff.prototype.setJitter = function (jitter) {
                this.jitter = jitter;
            };


        }, {}], 8: [function (_dereq_, module, exports) {
            /**
             * Slice reference.
             */

            var slice = [].slice;

            /**
             * Bind `obj` to `fn`.
             *
             * @param {Object} obj
             * @param {Function|String} fn or string
             * @return {Function}
             * @api public
             */

            module.exports = function (obj, fn) {
                if ('string' == typeof fn) fn = obj[fn];
                if ('function' != typeof fn) throw new Error('bind() requires a function');
                var args = slice.call(arguments, 2);
                return function () {
                    return fn.apply(obj, args.concat(slice.call(arguments)));
                }
            };

        }, {}], 9: [function (_dereq_, module, exports) {

            /**
             * Expose `Emitter`.
             */

            module.exports = Emitter;

            /**
             * Initialize a new `Emitter`.
             *
             * @api public
             */

            function Emitter(obj) {
                if (obj) return mixin(obj);
            };

            /**
             * Mixin the emitter properties.
             *
             * @param {Object} obj
             * @return {Object}
             * @api private
             */

            function mixin(obj) {
                for (var key in Emitter.prototype) {
                    obj[key] = Emitter.prototype[key];
                }
                return obj;
            }

            /**
             * Listen on the given `event` with `fn`.
             *
             * @param {String} event
             * @param {Function} fn
             * @return {Emitter}
             * @api public
             */

            Emitter.prototype.on =
            Emitter.prototype.addEventListener = function (event, fn) {
                this._Callbacks = this._Callbacks || {};
                (this._Callbacks[event] = this._Callbacks[event] || [])
                  .push(fn);
                return this;
            };

            /**
             * Adds an `event` listener that will be invoked a single
             * time then automatically removed.
             *
             * @param {String} event
             * @param {Function} fn
             * @return {Emitter}
             * @api public
             */

            Emitter.prototype.once = function (event, fn) {
                var self = this;
                this._Callbacks = this._Callbacks || {};

                function on() {
                    self.off(event, on);
                    fn.apply(this, arguments);
                }

                on.fn = fn;
                this.on(event, on);
                return this;
            };

            /**
             * Remove the given Callback for `event` or all
             * registered Callbacks.
             *
             * @param {String} event
             * @param {Function} fn
             * @return {Emitter}
             * @api public
             */

            Emitter.prototype.off =
            Emitter.prototype.removeListener =
            Emitter.prototype.removeAllListeners =
            Emitter.prototype.removeEventListener = function (event, fn) {
                this._Callbacks = this._Callbacks || {};

                // all
                if (0 == arguments.length) {
                    this._Callbacks = {};
                    return this;
                }

                // specific event
                var Callbacks = this._Callbacks[event];
                if (!Callbacks) return this;

                // remove all handlers
                if (1 == arguments.length) {
                    delete this._Callbacks[event];
                    return this;
                }

                // remove specific handler
                var cb;
                for (var i = 0; i < Callbacks.length; i++) {
                    cb = Callbacks[i];
                    if (cb === fn || cb.fn === fn) {
                        Callbacks.splice(i, 1);
                        break;
                    }
                }
                return this;
            };

            /**
             * Emit `event` with the given args.
             *
             * @param {String} event
             * @param {Mixed} ...
             * @return {Emitter}
             */

            Emitter.prototype.emit = function (event) {
                this._Callbacks = this._Callbacks || {};
                var args = [].slice.call(arguments, 1)
                  , Callbacks = this._Callbacks[event];

                if (Callbacks) {
                    Callbacks = Callbacks.slice(0);
                    for (var i = 0, len = Callbacks.length; i < len; ++i) {
                        Callbacks[i].apply(this, args);
                    }
                }

                return this;
            };

            /**
             * Return array of Callbacks for `event`.
             *
             * @param {String} event
             * @return {Array}
             * @api public
             */

            Emitter.prototype.listeners = function (event) {
                this._Callbacks = this._Callbacks || {};
                return this._Callbacks[event] || [];
            };

            /**
             * Check if this emitter has `event` handlers.
             *
             * @param {String} event
             * @return {Boolean}
             * @api public
             */

            Emitter.prototype.hasListeners = function (event) {
                return !!this.listeners(event).length;
            };

        }, {}], 10: [function (_dereq_, module, exports) {

            /**
             * Expose `debug()` as the module.
             */

            module.exports = debug;

            /**
             * Create a debugger with the given `name`.
             *
             * @param {String} name
             * @return {Type}
             * @api public
             */

            function debug(name) {
                if (!debug.enabled(name)) return function () { };

                return function (fmt) {
                    fmt = coerce(fmt);

                    var curr = new Date;
                    var ms = curr - (debug[name] || curr);
                    debug[name] = curr;

                    fmt = name
                      + ' '
                      + fmt
                      + ' +' + debug.humanize(ms);

                    // This hackery is required for IE8
                    // where `console.log` doesn't have 'apply'
                    window.console
                      && console.log
                      && Function.prototype.apply.call(console.log, console, arguments);
                }
            }

            /**
             * The currently active debug mode names.
             */

            debug.names = [];
            debug.skips = [];

            /**
             * Enables a debug mode by name. This can include modes
             * separated by a colon and wildcards.
             *
             * @param {String} name
             * @api public
             */

            debug.enable = function (name) {
                try {
                    localStorage.debug = name;
                } catch (e) { }

                var split = (name || '').split(/[\s,]+/)
                  , len = split.length;

                for (var i = 0; i < len; i++) {
                    name = split[i].replace('*', '.*?');
                    if (name[0] === '-') {
                        debug.skips.push(new RegExp('^' + name.substr(1) + '$'));
                    }
                    else {
                        debug.names.push(new RegExp('^' + name + '$'));
                    }
                }
            };

            /**
             * Disable debug output.
             *
             * @api public
             */

            debug.disable = function () {
                debug.enable('');
            };

            /**
             * Humanize the given `ms`.
             *
             * @param {Number} m
             * @return {String}
             * @api private
             */

            debug.humanize = function (ms) {
                var sec = 1000
                  , min = 60 * 1000
                  , hour = 60 * min;

                if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
                if (ms >= min) return (ms / min).toFixed(1) + 'm';
                if (ms >= sec) return (ms / sec | 0) + 's';
                return ms + 'ms';
            };

            /**
             * Returns true if the given mode name is enabled, false otherwise.
             *
             * @param {String} name
             * @return {Boolean}
             * @api public
             */

            debug.enabled = function (name) {
                for (var i = 0, len = debug.skips.length; i < len; i++) {
                    if (debug.skips[i].test(name)) {
                        return false;
                    }
                }
                for (var i = 0, len = debug.names.length; i < len; i++) {
                    if (debug.names[i].test(name)) {
                        return true;
                    }
                }
                return false;
            };

            /**
             * Coerce `val`.
             */

            function coerce(val) {
                if (val instanceof Error) return val.stack || val.message;
                return val;
            }

            // persist

            try {
                if (window.localStorage) debug.enable(localStorage.debug);
            } catch (e) { }

        }, {}], 11: [function (_dereq_, module, exports) {

            module.exports = _dereq_('./lib/');

        }, { "./lib/": 12 }], 12: [function (_dereq_, module, exports) {

            module.exports = _dereq_('./socket');

            /**
             * Exports parser
             *
             * @api public
             *
             */
            module.exports.parser = _dereq_('engine.io-parser');

        }, { "./socket": 13, "engine.io-parser": 25 }], 13: [function (_dereq_, module, exports) {
            (function (global) {
                /**
                 * Module dependencies.
                 */

                var transports = _dereq_('./transports');
                var Emitter = _dereq_('component-emitter');
                var debug = _dereq_('debug')('engine.io-client:socket');
                var index = _dereq_('indexof');
                var parser = _dereq_('engine.io-parser');
                var parseuri = _dereq_('parseuri');
                var parsejson = _dereq_('parsejson');
                var parseqs = _dereq_('parseqs');

                /**
                 * Module exports.
                 */

                module.exports = Socket;

                /**
                 * Noop function.
                 *
                 * @api private
                 */

                function noop() { }

                /**
                 * Socket constructor.
                 *
                 * @param {String|Object} uri or options
                 * @param {Object} options
                 * @api public
                 */

                function Socket(uri, opts) {
                    if (!(this instanceof Socket)) return new Socket(uri, opts);

                    opts = opts || {};

                    if (uri && 'object' == typeof uri) {
                        opts = uri;
                        uri = null;
                    }

                    if (uri) {
                        uri = parseuri(uri);
                        opts.host = uri.host;
                        opts.secure = uri.protocol == 'https' || uri.protocol == 'wss';
                        opts.port = uri.port;
                        if (uri.query) opts.query = uri.query;
                    }

                    this.secure = null != opts.secure ? opts.secure :
                      (global.location && 'https:' == location.protocol);

                    if (opts.host) {
                        var pieces = opts.host.split(':');
                        opts.hostname = pieces.shift();
                        if (pieces.length) {
                            opts.port = pieces.pop();
                        } else if (!opts.port) {
                            // if no port is specified manually, use the protocol default
                            opts.port = this.secure ? '443' : '80';
                        }
                    }

                    this.agent = opts.agent || false;
                    this.hostname = opts.hostname ||
                      (global.location ? location.hostname : 'localhost');
                    this.port = opts.port || (global.location && location.port ?
                         location.port :
                         (this.secure ? 443 : 80));
                    this.query = opts.query || {};
                    if ('string' == typeof this.query) this.query = parseqs.decode(this.query);
                    this.upgrade = false !== opts.upgrade;
                    this.path = (opts.path || '/engine.io').replace(/\/$/, '') + '/';
                    this.forceJSONP = !!opts.forceJSONP;
                    this.jsonp = false !== opts.jsonp;
                    this.forceBase64 = !!opts.forceBase64;
                    this.enablesXDR = !!opts.enablesXDR;
                    this.timestampParam = opts.timestampParam || 't';
                    this.timestampRequests = opts.timestampRequests;
                    this.transports = opts.transports || ['polling', 'websocket'];
                    this.readyState = '';
                    this.writeBuffer = [];
                    this.CallbackBuffer = [];
                    this.policyPort = opts.policyPort || 843;
                    this.rememberUpgrade = opts.rememberUpgrade || false;
                    this.binaryType = null;
                    this.onlyBinaryUpgrades = opts.onlyBinaryUpgrades;

                    // SSL options for Node.js client
                    this.pfx = opts.pfx || null;
                    this.key = opts.key || null;
                    this.passphrase = opts.passphrase || null;
                    this.cert = opts.cert || null;
                    this.ca = opts.ca || null;
                    this.ciphers = opts.ciphers || null;
                    this.rejectUnauthorized = opts.rejectUnauthorized || null;

                    this.open();
                }

                Socket.priorWebsocketSuccess = false;

                /**
                 * Mix in `Emitter`.
                 */

                Emitter(Socket.prototype);

                /**
                 * Protocol version.
                 *
                 * @api public
                 */

                Socket.protocol = parser.protocol; // this is an int

                /**
                 * Expose deps for legacy compatibility
                 * and standalone browser access.
                 */

                Socket.Socket = Socket;
                Socket.Transport = _dereq_('./transport');
                Socket.transports = _dereq_('./transports');
                Socket.parser = _dereq_('engine.io-parser');

                /**
                 * Creates transport of the given type.
                 *
                 * @param {String} transport name
                 * @return {Transport}
                 * @api private
                 */

                Socket.prototype.createTransport = function (name) {
                    debug('creating transport "%s"', name);
                    var query = clone(this.query);

                    // append engine.io protocol identifier
                    query.EIO = parser.protocol;

                    // transport name
                    query.transport = name;

                    // session id if we already have one
                    if (this.id) query.sid = this.id;

                    var transport = new transports[name]({
                        agent: this.agent,
                        hostname: this.hostname,
                        port: this.port,
                        secure: this.secure,
                        path: this.path,
                        query: query,
                        forceJSONP: this.forceJSONP,
                        jsonp: this.jsonp,
                        forceBase64: this.forceBase64,
                        enablesXDR: this.enablesXDR,
                        timestampRequests: this.timestampRequests,
                        timestampParam: this.timestampParam,
                        policyPort: this.policyPort,
                        socket: this,
                        pfx: this.pfx,
                        key: this.key,
                        passphrase: this.passphrase,
                        cert: this.cert,
                        ca: this.ca,
                        ciphers: this.ciphers,
                        rejectUnauthorized: this.rejectUnauthorized
                    });

                    return transport;
                };

                function clone(obj) {
                    var o = {};
                    for (var i in obj) {
                        if (obj.hasOwnProperty(i)) {
                            o[i] = obj[i];
                        }
                    }
                    return o;
                }

                /**
                 * Initializes transport to use and starts probe.
                 *
                 * @api private
                 */
                Socket.prototype.open = function () {
                    var transport;
                    if (this.rememberUpgrade && Socket.priorWebsocketSuccess && this.transports.indexOf('websocket') != -1) {
                        transport = 'websocket';
                    } else if (0 == this.transports.length) {
                        // Emit error on next tick so it can be listened to
                        var self = this;
                        setTimeout(function () {
                            self.emit('error', 'No transports available');
                        }, 0);
                        return;
                    } else {
                        transport = this.transports[0];
                    }
                    this.readyState = 'opening';

                    // Retry with the next transport if the transport is disabled (jsonp: false)
                    var transport;
                    try {
                        transport = this.createTransport(transport);
                    } catch (e) {
                        this.transports.shift();
                        this.open();
                        return;
                    }

                    transport.open();
                    this.setTransport(transport);
                };

                /**
                 * Sets the current transport. Disables the existing one (if any).
                 *
                 * @api private
                 */

                Socket.prototype.setTransport = function (transport) {
                    debug('setting transport %s', transport.name);
                    var self = this;

                    if (this.transport) {
                        debug('clearing existing transport %s', this.transport.name);
                        this.transport.removeAllListeners();
                    }

                    // set up transport
                    this.transport = transport;

                    // set up transport listeners
                    transport
                    .on('drain', function () {
                        self.onDrain();
                    })
                    .on('packet', function (packet) {
                        self.onPacket(packet);
                    })
                    .on('error', function (e) {
                        self.onError(e);
                    })
                    .on('close', function () {
                        self.onClose('transport close');
                    });
                };

                /**
                 * Probes a transport.
                 *
                 * @param {String} transport name
                 * @api private
                 */

                Socket.prototype.probe = function (name) {
                    debug('probing transport "%s"', name);
                    var transport = this.createTransport(name, { probe: 1 })
                      , failed = false
                      , self = this;

                    Socket.priorWebsocketSuccess = false;

                    function onTransportOpen() {
                        if (self.onlyBinaryUpgrades) {
                            var upgradeLosesBinary = !this.supportsBinary && self.transport.supportsBinary;
                            failed = failed || upgradeLosesBinary;
                        }
                        if (failed) return;

                        debug('probe transport "%s" opened', name);
                        transport.send([{ type: 'ping', data: 'probe' }]);
                        transport.once('packet', function (msg) {
                            if (failed) return;
                            if ('pong' == msg.type && 'probe' == msg.data) {
                                debug('probe transport "%s" pong', name);
                                self.upgrading = true;
                                self.emit('upgrading', transport);
                                if (!transport) return;
                                Socket.priorWebsocketSuccess = 'websocket' == transport.name;

                                debug('pausing current transport "%s"', self.transport.name);
                                self.transport.pause(function () {
                                    if (failed) return;
                                    if ('closed' == self.readyState) return;
                                    debug('changing transport and sending upgrade packet');

                                    cleanup();

                                    self.setTransport(transport);
                                    transport.send([{ type: 'upgrade' }]);
                                    self.emit('upgrade', transport);
                                    transport = null;
                                    self.upgrading = false;
                                    self.flush();
                                });
                            } else {
                                debug('probe transport "%s" failed', name);
                                var err = new Error('probe error');
                                err.transport = transport.name;
                                self.emit('upgradeError', err);
                            }
                        });
                    }

                    function freezeTransport() {
                        if (failed) return;

                        // Any Callback called by transport should be ignored since now
                        failed = true;

                        cleanup();

                        transport.close();
                        transport = null;
                    }

                    //Handle any error that happens while probing
                    function onerror(err) {
                        var error = new Error('probe error: ' + err);
                        error.transport = transport.name;

                        freezeTransport();

                        debug('probe transport "%s" failed because of error: %s', name, err);

                        self.emit('upgradeError', error);
                    }

                    function onTransportClose() {
                        onerror("transport closed");
                    }

                    //When the socket is closed while we're probing
                    function onclose() {
                        onerror("socket closed");
                    }

                    //When the socket is upgraded while we're probing
                    function onupgrade(to) {
                        if (transport && to.name != transport.name) {
                            debug('"%s" works - aborting "%s"', to.name, transport.name);
                            freezeTransport();
                        }
                    }

                    //Remove all listeners on the transport and on self
                    function cleanup() {
                        transport.removeListener('open', onTransportOpen);
                        transport.removeListener('error', onerror);
                        transport.removeListener('close', onTransportClose);
                        self.removeListener('close', onclose);
                        self.removeListener('upgrading', onupgrade);
                    }

                    transport.once('open', onTransportOpen);
                    transport.once('error', onerror);
                    transport.once('close', onTransportClose);

                    this.once('close', onclose);
                    this.once('upgrading', onupgrade);

                    transport.open();

                };

                /**
                 * Called when connection is deemed open.
                 *
                 * @api public
                 */

                Socket.prototype.onOpen = function () {
                    debug('socket open');
                    this.readyState = 'open';
                    Socket.priorWebsocketSuccess = 'websocket' == this.transport.name;
                    this.emit('open');
                    this.flush();

                    // we check for `readyState` in case an `open`
                    // listener already closed the socket
                    if ('open' == this.readyState && this.upgrade && this.transport.pause) {
                        debug('starting upgrade probes');
                        for (var i = 0, l = this.upgrades.length; i < l; i++) {
                            this.probe(this.upgrades[i]);
                        }
                    }
                };

                /**
                 * Handles a packet.
                 *
                 * @api private
                 */

                Socket.prototype.onPacket = function (packet) {
                    if ('opening' == this.readyState || 'open' == this.readyState) {
                        debug('socket receive: type "%s", data "%s"', packet.type, packet.data);

                        this.emit('packet', packet);

                        // Socket is live - any packet counts
                        this.emit('heartbeat');

                        switch (packet.type) {
                            case 'open':
                                this.onHandshake(parsejson(packet.data));
                                break;

                            case 'pong':
                                this.setPing();
                                break;

                            case 'error':
                                var err = new Error('server error');
                                err.code = packet.data;
                                this.emit('error', err);
                                break;

                            case 'message':
                                this.emit('data', packet.data);
                                this.emit('message', packet.data);
                                break;
                        }
                    } else {
                        debug('packet received with socket readyState "%s"', this.readyState);
                    }
                };

                /**
                 * Called upon handshake completion.
                 *
                 * @param {Object} handshake obj
                 * @api private
                 */

                Socket.prototype.onHandshake = function (data) {
                    this.emit('handshake', data);
                    this.id = data.sid;
                    this.transport.query.sid = data.sid;
                    this.upgrades = this.filterUpgrades(data.upgrades);
                    this.pingInterval = data.pingInterval;
                    this.pingTimeout = data.pingTimeout;
                    this.onOpen();
                    // In case open handler closes socket
                    if ('closed' == this.readyState) return;
                    this.setPing();

                    // Prolong liveness of socket on heartbeat
                    this.removeListener('heartbeat', this.onHeartbeat);
                    this.on('heartbeat', this.onHeartbeat);
                };

                /**
                 * Resets ping timeout.
                 *
                 * @api private
                 */

                Socket.prototype.onHeartbeat = function (timeout) {
                    clearTimeout(this.pingTimeoutTimer);
                    var self = this;
                    self.pingTimeoutTimer = setTimeout(function () {
                        if ('closed' == self.readyState) return;
                        self.onClose('ping timeout');
                    }, timeout || (self.pingInterval + self.pingTimeout));
                };

                /**
                 * Pings server every `this.pingInterval` and expects response
                 * within `this.pingTimeout` or closes connection.
                 *
                 * @api private
                 */

                Socket.prototype.setPing = function () {
                    var self = this;
                    clearTimeout(self.pingIntervalTimer);
                    self.pingIntervalTimer = setTimeout(function () {
                        debug('writing ping packet - expecting pong within %sms', self.pingTimeout);
                        self.ping();
                        self.onHeartbeat(self.pingTimeout);
                    }, self.pingInterval);
                };

                /**
                * Sends a ping packet.
                *
                * @api public
                */

                Socket.prototype.ping = function () {
                    this.sendPacket('ping');
                };

                /**
                 * Called on `drain` event
                 *
                 * @api private
                 */

                Socket.prototype.onDrain = function () {
                    for (var i = 0; i < this.prevBufferLen; i++) {
                        if (this.CallbackBuffer[i]) {
                            this.CallbackBuffer[i]();
                        }
                    }

                    this.writeBuffer.splice(0, this.prevBufferLen);
                    this.CallbackBuffer.splice(0, this.prevBufferLen);

                    // setting prevBufferLen = 0 is very important
                    // for example, when upgrading, upgrade packet is sent over,
                    // and a nonzero prevBufferLen could cause problems on `drain`
                    this.prevBufferLen = 0;

                    if (this.writeBuffer.length == 0) {
                        this.emit('drain');
                    } else {
                        this.flush();
                    }
                };

                /**
                 * Flush write buffers.
                 *
                 * @api private
                 */

                Socket.prototype.flush = function () {
                    if ('closed' != this.readyState && this.transport.writable &&
                      !this.upgrading && this.writeBuffer.length) {
                        debug('flushing %d packets in socket', this.writeBuffer.length);
                        this.transport.send(this.writeBuffer);
                        // keep track of current length of writeBuffer
                        // splice writeBuffer and CallbackBuffer on `drain`
                        this.prevBufferLen = this.writeBuffer.length;
                        this.emit('flush');
                    }
                };

                /**
                 * Sends a message.
                 *
                 * @param {String} message.
                 * @param {Function} Callback function.
                 * @return {Socket} for chaining.
                 * @api public
                 */

                Socket.prototype.write =
                Socket.prototype.send = function (msg, fn) {
                    this.sendPacket('message', msg, fn);
                    return this;
                };

                /**
                 * Sends a packet.
                 *
                 * @param {String} packet type.
                 * @param {String} data.
                 * @param {Function} Callback function.
                 * @api private
                 */

                Socket.prototype.sendPacket = function (type, data, fn) {
                    if ('closing' == this.readyState || 'closed' == this.readyState) {
                        return;
                    }

                    var packet = { type: type, data: data };
                    this.emit('packetCreate', packet);
                    this.writeBuffer.push(packet);
                    this.CallbackBuffer.push(fn);
                    this.flush();
                };

                /**
                 * Closes the connection.
                 *
                 * @api private
                 */

                Socket.prototype.close = function () {
                    if ('opening' == this.readyState || 'open' == this.readyState) {
                        this.readyState = 'closing';

                        var self = this;

                        function close() {
                            self.onClose('forced close');
                            debug('socket closing - telling transport to close');
                            self.transport.close();
                        }

                        function cleanupAndClose() {
                            self.removeListener('upgrade', cleanupAndClose);
                            self.removeListener('upgradeError', cleanupAndClose);
                            close();
                        }

                        function waitForUpgrade() {
                            // wait for upgrade to finish since we can't send packets while pausing a transport
                            self.once('upgrade', cleanupAndClose);
                            self.once('upgradeError', cleanupAndClose);
                        }

                        if (this.writeBuffer.length) {
                            this.once('drain', function () {
                                if (this.upgrading) {
                                    waitForUpgrade();
                                } else {
                                    close();
                                }
                            });
                        } else if (this.upgrading) {
                            waitForUpgrade();
                        } else {
                            close();
                        }
                    }

                    return this;
                };

                /**
                 * Called upon transport error
                 *
                 * @api private
                 */

                Socket.prototype.onError = function (err) {
                    debug('socket error %j', err);
                    Socket.priorWebsocketSuccess = false;
                    this.emit('error', err);
                    this.onClose('transport error', err);
                };

                /**
                 * Called upon transport close.
                 *
                 * @api private
                 */

                Socket.prototype.onClose = function (reason, desc) {
                    if ('opening' == this.readyState || 'open' == this.readyState || 'closing' == this.readyState) {
                        debug('socket close with reason: "%s"', reason);
                        var self = this;

                        // clear timers
                        clearTimeout(this.pingIntervalTimer);
                        clearTimeout(this.pingTimeoutTimer);

                        // clean buffers in next tick, so developers can still
                        // grab the buffers on `close` event
                        setTimeout(function () {
                            self.writeBuffer = [];
                            self.CallbackBuffer = [];
                            self.prevBufferLen = 0;
                        }, 0);

                        // stop event from firing again for transport
                        this.transport.removeAllListeners('close');

                        // ensure transport won't stay open
                        this.transport.close();

                        // ignore further transport communication
                        this.transport.removeAllListeners();

                        // set ready state
                        this.readyState = 'closed';

                        // clear session id
                        this.id = null;

                        // emit close event
                        this.emit('close', reason, desc);
                    }
                };

                /**
                 * Filters upgrades, returning only those matching client transports.
                 *
                 * @param {Array} server upgrades
                 * @api private
                 *
                 */

                Socket.prototype.filterUpgrades = function (upgrades) {
                    var filteredUpgrades = [];
                    for (var i = 0, j = upgrades.length; i < j; i++) {
                        if (~index(this.transports, upgrades[i])) filteredUpgrades.push(upgrades[i]);
                    }
                    return filteredUpgrades;
                };

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "./transport": 14, "./transports": 15, "component-emitter": 9, "debug": 22, "engine.io-parser": 25, "indexof": 42, "parsejson": 34, "parseqs": 35, "parseuri": 36 }], 14: [function (_dereq_, module, exports) {
            /**
             * Module dependencies.
             */

            var parser = _dereq_('engine.io-parser');
            var Emitter = _dereq_('component-emitter');

            /**
             * Module exports.
             */

            module.exports = Transport;

            /**
             * Transport abstract constructor.
             *
             * @param {Object} options.
             * @api private
             */

            function Transport(opts) {
                this.path = opts.path;
                this.hostname = opts.hostname;
                this.port = opts.port;
                this.secure = opts.secure;
                this.query = opts.query;
                this.timestampParam = opts.timestampParam;
                this.timestampRequests = opts.timestampRequests;
                this.readyState = '';
                this.agent = opts.agent || false;
                this.socket = opts.socket;
                this.enablesXDR = opts.enablesXDR;

                // SSL options for Node.js client
                this.pfx = opts.pfx;
                this.key = opts.key;
                this.passphrase = opts.passphrase;
                this.cert = opts.cert;
                this.ca = opts.ca;
                this.ciphers = opts.ciphers;
                this.rejectUnauthorized = opts.rejectUnauthorized;
            }

            /**
             * Mix in `Emitter`.
             */

            Emitter(Transport.prototype);

            /**
             * A counter used to prevent collisions in the timestamps used
             * for cache busting.
             */

            Transport.timestamps = 0;

            /**
             * Emits an error.
             *
             * @param {String} str
             * @return {Transport} for chaining
             * @api public
             */

            Transport.prototype.onError = function (msg, desc) {
                var err = new Error(msg);
                err.type = 'TransportError';
                err.description = desc;
                this.emit('error', err);
                return this;
            };

            /**
             * Opens the transport.
             *
             * @api public
             */

            Transport.prototype.open = function () {
                if ('closed' == this.readyState || '' == this.readyState) {
                    this.readyState = 'opening';
                    this.doOpen();
                }

                return this;
            };

            /**
             * Closes the transport.
             *
             * @api private
             */

            Transport.prototype.close = function () {
                if ('opening' == this.readyState || 'open' == this.readyState) {
                    this.doClose();
                    this.onClose();
                }

                return this;
            };

            /**
             * Sends multiple packets.
             *
             * @param {Array} packets
             * @api private
             */

            Transport.prototype.send = function (packets) {
                if ('open' == this.readyState) {
                    this.write(packets);
                } else {
                    throw new Error('Transport not open');
                }
            };

            /**
             * Called upon open
             *
             * @api private
             */

            Transport.prototype.onOpen = function () {
                this.readyState = 'open';
                this.writable = true;
                this.emit('open');
            };

            /**
             * Called with data.
             *
             * @param {String} data
             * @api private
             */

            Transport.prototype.onData = function (data) {
                var packet = parser.decodePacket(data, this.socket.binaryType);
                this.onPacket(packet);
            };

            /**
             * Called with a decoded packet.
             */

            Transport.prototype.onPacket = function (packet) {
                this.emit('packet', packet);
            };

            /**
             * Called upon close.
             *
             * @api private
             */

            Transport.prototype.onClose = function () {
                this.readyState = 'closed';
                this.emit('close');
            };

        }, { "component-emitter": 9, "engine.io-parser": 25 }], 15: [function (_dereq_, module, exports) {
            (function (global) {
                /**
                 * Module dependencies
                 */

                var XMLHttpRequest = _dereq_('xmlhttprequest');
                var XHR = _dereq_('./polling-xhr');
                var JSONP = _dereq_('./polling-jsonp');
                var websocket = _dereq_('./websocket');

                /**
                 * Export transports.
                 */

                exports.polling = polling;
                exports.websocket = websocket;

                /**
                 * Polling transport polymorphic constructor.
                 * Decides on xhr vs jsonp based on feature detection.
                 *
                 * @api private
                 */

                function polling(opts) {
                    var xhr;
                    var xd = false;
                    var xs = false;
                    var jsonp = false !== opts.jsonp;

                    if (global.location) {
                        var isSSL = 'https:' == location.protocol;
                        var port = location.port;

                        // some user agents have empty `location.port`
                        if (!port) {
                            port = isSSL ? 443 : 80;
                        }

                        xd = opts.hostname != location.hostname || port != opts.port;
                        xs = opts.secure != isSSL;
                    }

                    opts.xdomain = xd;
                    opts.xscheme = xs;
                    xhr = new XMLHttpRequest(opts);

                    if ('open' in xhr && !opts.forceJSONP) {
                        return new XHR(opts);
                    } else {
                        if (!jsonp) throw new Error('JSONP disabled');
                        return new JSONP(opts);
                    }
                }

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "./polling-jsonp": 16, "./polling-xhr": 17, "./websocket": 19, "xmlhttprequest": 20 }], 16: [function (_dereq_, module, exports) {
            (function (global) {

                /**
                 * Module requirements.
                 */

                var Polling = _dereq_('./polling');
                var inherit = _dereq_('component-inherit');

                /**
                 * Module exports.
                 */

                module.exports = JSONPPolling;

                /**
                 * Cached regular expressions.
                 */

                var rNewline = /\n/g;
                var rEscapedNewline = /\\n/g;

                /**
                 * Global JSONP Callbacks.
                 */

                var Callbacks;

                /**
                 * Callbacks count.
                 */

                var index = 0;

                /**
                 * Noop.
                 */

                function empty() { }

                /**
                 * JSONP Polling constructor.
                 *
                 * @param {Object} opts.
                 * @api public
                 */

                function JSONPPolling(opts) {
                    Polling.call(this, opts);

                    this.query = this.query || {};

                    // define global Callbacks array if not present
                    // we do this here (lazily) to avoid unneeded global pollution
                    if (!Callbacks) {
                        // we need to consider multiple engines in the same page
                        if (!global.___eio) global.___eio = [];
                        Callbacks = global.___eio;
                    }

                    // Callback identifier
                    this.index = Callbacks.length;

                    // add Callback to jsonp global
                    var self = this;
                    Callbacks.push(function (msg) {
                        self.onData(msg);
                    });

                    // append to query string
                    this.query.j = this.index;

                    // prevent spurious errors from being emitted when the window is unloaded
                    if (global.document && global.addEventListener) {
                        global.addEventListener('beforeunload', function () {
                            if (self.script) self.script.onerror = empty;
                        }, false);
                    }
                }

                /**
                 * Inherits from Polling.
                 */

                inherit(JSONPPolling, Polling);

                /*
                 * JSONP only supports binary as base64 encoded strings
                 */

                JSONPPolling.prototype.supportsBinary = false;

                /**
                 * Closes the socket.
                 *
                 * @api private
                 */

                JSONPPolling.prototype.doClose = function () {
                    if (this.script) {
                        this.script.parentNode.removeChild(this.script);
                        this.script = null;
                    }

                    if (this.form) {
                        this.form.parentNode.removeChild(this.form);
                        this.form = null;
                        this.iframe = null;
                    }

                    Polling.prototype.doClose.call(this);
                };

                /**
                 * Starts a poll cycle.
                 *
                 * @api private
                 */

                JSONPPolling.prototype.doPoll = function () {
                    var self = this;
                    var script = document.createElement('script');

                    if (this.script) {
                        this.script.parentNode.removeChild(this.script);
                        this.script = null;
                    }

                    script.async = true;
                    script.src = this.uri();
                    script.onerror = function (e) {
                        self.onError('jsonp poll error', e);
                    };

                    var insertAt = document.getElementsByTagName('script')[0];
                    insertAt.parentNode.insertBefore(script, insertAt);
                    this.script = script;

                    var isUAgecko = 'undefined' != typeof navigator && /gecko/i.test(navigator.userAgent);

                    if (isUAgecko) {
                        setTimeout(function () {
                            var iframe = document.createElement('iframe');
                            document.body.appendChild(iframe);
                            document.body.removeChild(iframe);
                        }, 100);
                    }
                };

                /**
                 * Writes with a hidden iframe.
                 *
                 * @param {String} data to send
                 * @param {Function} called upon flush.
                 * @api private
                 */

                JSONPPolling.prototype.doWrite = function (data, fn) {
                    var self = this;

                    if (!this.form) {
                        var form = document.createElement('form');
                        var area = document.createElement('textarea');
                        var id = this.iframeId = 'eio_iframe_' + this.index;
                        var iframe;

                        form.className = 'socketio';
                        form.style.position = 'absolute';
                        form.style.top = '-1000px';
                        form.style.left = '-1000px';
                        form.target = id;
                        form.method = 'POST';
                        form.setAttribute('accept-charset', 'utf-8');
                        area.name = 'd';
                        form.appendChild(area);
                        document.body.appendChild(form);

                        this.form = form;
                        this.area = area;
                    }

                    this.form.action = this.uri();

                    function complete() {
                        initIframe();
                        fn();
                    }

                    function initIframe() {
                        if (self.iframe) {
                            try {
                                self.form.removeChild(self.iframe);
                            } catch (e) {
                                self.onError('jsonp polling iframe removal error', e);
                            }
                        }

                        try {
                            // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
                            var html = '<iframe src="javascript:0" name="' + self.iframeId + '">';
                            iframe = document.createElement(html);
                        } catch (e) {
                            iframe = document.createElement('iframe');
                            iframe.name = self.iframeId;
                            iframe.src = 'javascript:0';
                        }

                        iframe.id = self.iframeId;

                        self.form.appendChild(iframe);
                        self.iframe = iframe;
                    }

                    initIframe();

                    // escape \n to prevent it from being converted into \r\n by some UAs
                    // double escaping is required for escaped new lines because unescaping of new lines can be done safely on server-side
                    data = data.replace(rEscapedNewline, '\\\n');
                    this.area.value = data.replace(rNewline, '\\n');

                    try {
                        this.form.submit();
                    } catch (e) { }

                    if (this.iframe.attachEvent) {
                        this.iframe.onreadystatechange = function () {
                            if (self.iframe.readyState == 'complete') {
                                complete();
                            }
                        };
                    } else {
                        this.iframe.onload = complete;
                    }
                };

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "./polling": 18, "component-inherit": 21 }], 17: [function (_dereq_, module, exports) {
            (function (global) {
                /**
                 * Module requirements.
                 */

                var XMLHttpRequest = _dereq_('xmlhttprequest');
                var Polling = _dereq_('./polling');
                var Emitter = _dereq_('component-emitter');
                var inherit = _dereq_('component-inherit');
                var debug = _dereq_('debug')('engine.io-client:polling-xhr');

                /**
                 * Module exports.
                 */

                module.exports = XHR;
                module.exports.Request = Request;

                /**
                 * Empty function
                 */

                function empty() { }

                /**
                 * XHR Polling constructor.
                 *
                 * @param {Object} opts
                 * @api public
                 */

                function XHR(opts) {
                    Polling.call(this, opts);

                    if (global.location) {
                        var isSSL = 'https:' == location.protocol;
                        var port = location.port;

                        // some user agents have empty `location.port`
                        if (!port) {
                            port = isSSL ? 443 : 80;
                        }

                        this.xd = opts.hostname != global.location.hostname ||
                          port != opts.port;
                        this.xs = opts.secure != isSSL;
                    }
                }

                /**
                 * Inherits from Polling.
                 */

                inherit(XHR, Polling);

                /**
                 * XHR supports binary
                 */

                XHR.prototype.supportsBinary = true;

                /**
                 * Creates a request.
                 *
                 * @param {String} method
                 * @api private
                 */

                XHR.prototype.request = function (opts) {
                    opts = opts || {};
                    opts.uri = this.uri();
                    opts.xd = this.xd;
                    opts.xs = this.xs;
                    opts.agent = this.agent || false;
                    opts.supportsBinary = this.supportsBinary;
                    opts.enablesXDR = this.enablesXDR;

                    // SSL options for Node.js client

                    opts.pfx = this.pfx;
                    opts.key = this.key;
                    opts.passphrase = this.passphrase;
                    opts.cert = this.cert;
                    opts.ca = this.ca;
                    opts.ciphers = this.ciphers;
                    opts.rejectUnauthorized = this.rejectUnauthorized;//  || false; // Pritam....

                    return new Request(opts);
                };

                /**
                 * Sends data.
                 *
                 * @param {String} data to send.
                 * @param {Function} called upon flush.
                 * @api private
                 */

                XHR.prototype.doWrite = function (data, fn) {
                    var isBinary = typeof data !== 'string' && data !== undefined;
                    var req = this.request({ method: 'POST', data: data, isBinary: isBinary });
                    var self = this;
                    req.on('success', fn);
                    req.on('error', function (err) {
                        self.onError('xhr post error', err);
                    });
                    this.sendXhr = req;
                };

                /**
                 * Starts a poll cycle.
                 *
                 * @api private
                 */

                XHR.prototype.doPoll = function () {
                    debug('xhr poll');
                    var req = this.request();
                    var self = this;
                    req.on('data', function (data) {
                        self.onData(data);
                    });
                    req.on('error', function (err) {
                        self.onError('xhr poll error', err);
                    });
                    this.pollXhr = req;
                };

                /**
                 * Request constructor
                 *
                 * @param {Object} options
                 * @api public
                 */

                function Request(opts) {
                    this.method = opts.method || 'GET';
                    this.uri = opts.uri;
                    this.xd = !!opts.xd;
                    this.xs = !!opts.xs;
                    this.async = false !== opts.async;
                    this.data = undefined != opts.data ? opts.data : null;
                    this.agent = opts.agent;
                    this.isBinary = opts.isBinary;
                    this.supportsBinary = opts.supportsBinary;
                    this.enablesXDR = opts.enablesXDR;

                    // SSL options for Node.js client
                    this.pfx = opts.pfx;
                    this.key = opts.key;
                    this.passphrase = opts.passphrase;
                    this.cert = opts.cert;
                    this.ca = opts.ca;
                    this.ciphers = opts.ciphers;
                    this.rejectUnauthorized = opts.rejectUnauthorized;

                    this.create();
                }

                /**
                 * Mix in `Emitter`.
                 */

                Emitter(Request.prototype);

                /**
                 * Creates the XHR object and sends the request.
                 *
                 * @api private
                 */

                Request.prototype.create = function () {
                    var opts = { agent: this.agent, xdomain: this.xd, xscheme: this.xs, enablesXDR: this.enablesXDR };

                    // SSL options for Node.js client
                    opts.pfx = this.pfx;
                    opts.key = this.key;
                    opts.passphrase = this.passphrase;
                    opts.cert = this.cert;
                    opts.ca = this.ca;
                    opts.ciphers = this.ciphers;
                    opts.rejectUnauthorized = this.rejectUnauthorized;

                    var xhr = this.xhr = new XMLHttpRequest(opts);
                    var self = this;

                    try {
                        debug('xhr open %s: %s', this.method, this.uri);
                        xhr.open(this.method, this.uri, this.async);
                        if (this.supportsBinary) {
                            // This has to be done after open because Firefox is stupid
                            // http://stackoverflow.com/questions/13216903/get-binary-data-with-xmlhttprequest-in-a-firefox-extension
                            xhr.responseType = 'arraybuffer';
                        }

                        if ('POST' == this.method) {
                            try {
                                if (this.isBinary) {
                                    xhr.setRequestHeader('Content-type', 'application/octet-stream');
                                } else {
                                    xhr.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
                                }
                            } catch (e) { }
                        }

                        // ie6 check
                        if ('withCredentials' in xhr) {
                            xhr.withCredentials = true;
                        }

                        if (this.hasXDR()) {
                            xhr.onload = function () {
                                self.onLoad();
                            };
                            xhr.onerror = function () {
                                self.onError(xhr.responseText);
                            };
                        } else {
                            xhr.onreadystatechange = function () {
                                if (4 != xhr.readyState) return;
                                if (200 == xhr.status || 1223 == xhr.status) {
                                    self.onLoad();
                                } else {
                                    // make sure the `error` event handler that's user-set
                                    // does not throw in the same tick and gets caught here
                                    setTimeout(function () {
                                        self.onError(xhr.status);
                                    }, 0);
                                }
                            };
                        }

                        debug('xhr data %s', this.data);
                        xhr.send(this.data);
                    } catch (e) {
                        // Need to defer since .create() is called directly fhrom the constructor
                        // and thus the 'error' event can only be only bound *after* this exception
                        // occurs.  Therefore, also, we cannot throw here at all.
                        setTimeout(function () {
                            self.onError(e);
                        }, 0);
                        return;
                    }

                    if (global.document) {
                        this.index = Request.requestsCount++;
                        Request.requests[this.index] = this;
                    }
                };

                /**
                 * Called upon successful response.
                 *
                 * @api private
                 */

                Request.prototype.onSuccess = function () {
                    this.emit('success');
                    this.cleanup();
                };

                /**
                 * Called if we have data.
                 *
                 * @api private
                 */

                Request.prototype.onData = function (data) {
                    this.emit('data', data);
                    this.onSuccess();
                };

                /**
                 * Called upon error.
                 *
                 * @api private
                 */

                Request.prototype.onError = function (err) {
                    this.emit('error', err);
                    this.cleanup(true);
                };

                /**
                 * Cleans up house.
                 *
                 * @api private
                 */

                Request.prototype.cleanup = function (fromError) {
                    if ('undefined' == typeof this.xhr || null === this.xhr) {
                        return;
                    }
                    // xmlhttprequest
                    if (this.hasXDR()) {
                        this.xhr.onload = this.xhr.onerror = empty;
                    } else {
                        this.xhr.onreadystatechange = empty;
                    }

                    if (fromError) {
                        try {
                            this.xhr.abort();
                        } catch (e) { }
                    }

                    if (global.document) {
                        delete Request.requests[this.index];
                    }

                    this.xhr = null;
                };

                /**
                 * Called upon load.
                 *
                 * @api private
                 */

                Request.prototype.onLoad = function () {
                    var data;
                    try {
                        var contentType;
                        try {
                            contentType = this.xhr.getResponseHeader('Content-Type').split(';')[0];
                        } catch (e) { }
                        if (contentType === 'application/octet-stream') {
                            data = this.xhr.response;
                        } else {
                            if (!this.supportsBinary) {
                                data = this.xhr.responseText;
                            } else {
                                data = 'ok';
                            }
                        }
                    } catch (e) {
                        this.onError(e);
                    }
                    if (null != data) {
                        this.onData(data);
                    }
                };

                /**
                 * Check if it has XDomainRequest.
                 *
                 * @api private
                 */

                Request.prototype.hasXDR = function () {
                    return 'undefined' !== typeof global.XDomainRequest && !this.xs && this.enablesXDR;
                };

                /**
                 * Aborts the request.
                 *
                 * @api public
                 */

                Request.prototype.abort = function () {
                    this.cleanup();
                };

                /**
                 * Aborts pending requests when unloading the window. This is needed to prevent
                 * memory leaks (e.g. when using IE) and to ensure that no spurious error is
                 * emitted.
                 */

                if (global.document) {
                    Request.requestsCount = 0;
                    Request.requests = {};
                    if (global.attachEvent) {
                        global.attachEvent('onunload', unloadHandler);
                    } else if (global.addEventListener) {
                        global.addEventListener('beforeunload', unloadHandler, false);
                    }
                }

                function unloadHandler() {
                    for (var i in Request.requests) {
                        if (Request.requests.hasOwnProperty(i)) {
                            Request.requests[i].abort();
                        }
                    }
                }

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "./polling": 18, "component-emitter": 9, "component-inherit": 21, "debug": 22, "xmlhttprequest": 20 }], 18: [function (_dereq_, module, exports) {
            /**
             * Module dependencies.
             */

            var Transport = _dereq_('../transport');
            var parseqs = _dereq_('parseqs');
            var parser = _dereq_('engine.io-parser');
            var inherit = _dereq_('component-inherit');
            var debug = _dereq_('debug')('engine.io-client:polling');

            /**
             * Module exports.
             */

            module.exports = Polling;

            /**
             * Is XHR2 supported?
             */

            var hasXHR2 = (function () {
                var XMLHttpRequest = _dereq_('xmlhttprequest');
                var xhr = new XMLHttpRequest({ xdomain: false });
                return null != xhr.responseType;
            })();

            /**
             * Polling interface.
             *
             * @param {Object} opts
             * @api private
             */

            function Polling(opts) {
                var forceBase64 = (opts && opts.forceBase64);
                if (!hasXHR2 || forceBase64) {
                    this.supportsBinary = false;
                }
                Transport.call(this, opts);
            }

            /**
             * Inherits from Transport.
             */

            inherit(Polling, Transport);

            /**
             * Transport name.
             */

            Polling.prototype.name = 'polling';

            /**
             * Opens the socket (triggers polling). We write a PING message to determine
             * when the transport is open.
             *
             * @api private
             */

            Polling.prototype.doOpen = function () {
                this.poll();
            };

            /**
             * Pauses polling.
             *
             * @param {Function} Callback upon buffers are flushed and transport is paused
             * @api private
             */

            Polling.prototype.pause = function (onPause) {
                var pending = 0;
                var self = this;

                this.readyState = 'pausing';

                function pause() {
                    debug('paused');
                    self.readyState = 'paused';
                    onPause();
                }

                if (this.polling || !this.writable) {
                    var total = 0;

                    if (this.polling) {
                        debug('we are currently polling - waiting to pause');
                        total++;
                        this.once('pollComplete', function () {
                            debug('pre-pause polling complete');
                            --total || pause();
                        });
                    }

                    if (!this.writable) {
                        debug('we are currently writing - waiting to pause');
                        total++;
                        this.once('drain', function () {
                            debug('pre-pause writing complete');
                            --total || pause();
                        });
                    }
                } else {
                    pause();
                }
            };

            /**
             * Starts polling cycle.
             *
             * @api public
             */

            Polling.prototype.poll = function () {
                debug('polling');
                this.polling = true;
                this.doPoll();
                this.emit('poll');
            };

            /**
             * Overloads onData to detect payloads.
             *
             * @api private
             */

            Polling.prototype.onData = function (data) {
                var self = this;
                debug('polling got data %s', data);
                var Callback = function (packet, index, total) {
                    // if its the first message we consider the transport open
                    if ('opening' == self.readyState) {
                        self.onOpen();
                    }

                    // if its a close packet, we close the ongoing requests
                    if ('close' == packet.type) {
                        self.onClose();
                        return false;
                    }

                    // otherwise bypass onData and handle the message
                    self.onPacket(packet);
                };

                // decode payload
                parser.decodePayload(data, this.socket.binaryType, Callback);

                // if an event did not trigger closing
                if ('closed' != this.readyState) {
                    // if we got data we're not polling
                    this.polling = false;
                    this.emit('pollComplete');

                    if ('open' == this.readyState) {
                        this.poll();
                    } else {
                        debug('ignoring poll - transport state "%s"', this.readyState);
                    }
                }
            };

            /**
             * For polling, send a close packet.
             *
             * @api private
             */

            Polling.prototype.doClose = function () {
                var self = this;

                function close() {
                    debug('writing close packet');
                    self.write([{ type: 'close' }]);
                }

                if ('open' == this.readyState) {
                    debug('transport open - closing');
                    close();
                } else {
                    // in case we're trying to close while
                    // handshaking is in progress (GH-164)
                    debug('transport not open - deferring close');
                    this.once('open', close);
                }
            };

            /**
             * Writes a packets payload.
             *
             * @param {Array} data packets
             * @param {Function} drain Callback
             * @api private
             */

            Polling.prototype.write = function (packets) {
                var self = this;
                this.writable = false;
                var Callbackfn = function () {
                    self.writable = true;
                    self.emit('drain');
                };

                var self = this;
                parser.encodePayload(packets, this.supportsBinary, function (data) {
                    self.doWrite(data, Callbackfn);
                });
            };

            /**
             * Generates uri for connection.
             *
             * @api private
             */

            Polling.prototype.uri = function () {
                var query = this.query || {};
                var schema = this.secure ? 'https' : 'http';
                var port = '';

                // cache busting is forced
                if (false !== this.timestampRequests) {
                    query[this.timestampParam] = +new Date + '-' + Transport.timestamps++;
                }

                if (!this.supportsBinary && !query.sid) {
                    query.b64 = 1;
                }

                query = parseqs.encode(query);

                // avoid port if default for schema
                if (this.port && (('https' == schema && this.port != 443) ||
                   ('http' == schema && this.port != 80))) {
                    port = ':' + this.port;
                }

                // prepend ? to query
                if (query.length) {
                    query = '?' + query;
                }

                return schema + '://' + this.hostname + port + this.path + query;
            };

        }, { "../transport": 14, "component-inherit": 21, "debug": 22, "engine.io-parser": 25, "parseqs": 35, "xmlhttprequest": 20 }], 19: [function (_dereq_, module, exports) {
            /**
             * Module dependencies.
             */

            var Transport = _dereq_('../transport');
            var parser = _dereq_('engine.io-parser');
            var parseqs = _dereq_('parseqs');
            var inherit = _dereq_('component-inherit');
            var debug = _dereq_('debug')('engine.io-client:websocket');

            /**
             * `ws` exposes a WebSocket-compatible interface in
             * Node, or the `WebSocket` or `MozWebSocket` globals
             * in the browser.
             */

            var WebSocket = _dereq_('ws');

            /**
             * Module exports.
             */

            module.exports = WS;

            /**
             * WebSocket transport constructor.
             *
             * @api {Object} connection options
             * @api public
             */

            function WS(opts) {
                var forceBase64 = (opts && opts.forceBase64);
                if (forceBase64) {
                    this.supportsBinary = false;
                }
                Transport.call(this, opts);
            }

            /**
             * Inherits from Transport.
             */

            inherit(WS, Transport);

            /**
             * Transport name.
             *
             * @api public
             */

            WS.prototype.name = 'websocket';

            /*
             * WebSockets support binary
             */

            WS.prototype.supportsBinary = true;

            /**
             * Opens socket.
             *
             * @api private
             */

            WS.prototype.doOpen = function () {
                if (!this.check()) {
                    // let probe timeout
                    return;
                }

                var self = this;
                var uri = this.uri();
                var protocols = void (0);
                var opts = { agent: this.agent };

                // SSL options for Node.js client
                opts.pfx = this.pfx;
                opts.key = this.key;
                opts.passphrase = this.passphrase;
                opts.cert = this.cert;
                opts.ca = this.ca;
                opts.ciphers = this.ciphers;
                opts.rejectUnauthorized = this.rejectUnauthorized;

                this.ws = new WebSocket(uri, protocols, opts);

                if (this.ws.binaryType === undefined) {
                    this.supportsBinary = false;
                }

                this.ws.binaryType = 'arraybuffer';
                this.addEventListeners();
            };

            /**
             * Adds event listeners to the socket
             *
             * @api private
             */

            WS.prototype.addEventListeners = function () {
                var self = this;

                this.ws.onopen = function () {
                    self.onOpen();
                };
                this.ws.onclose = function () {
                    self.onClose();
                };
                this.ws.onmessage = function (ev) {
                    self.onData(ev.data);
                };
                this.ws.onerror = function (e) {
                    self.onError('websocket error', e);
                };
            };

            /**
             * Override `onData` to use a timer on iOS.
             * See: https://gist.github.com/mloughran/2052006
             *
             * @api private
             */

            if ('undefined' != typeof navigator
              && /iPad|iPhone|iPod/i.test(navigator.userAgent)) {
                WS.prototype.onData = function (data) {
                    var self = this;
                    setTimeout(function () {
                        Transport.prototype.onData.call(self, data);
                    }, 0);
                };
            }

            /**
             * Writes data to socket.
             *
             * @param {Array} array of packets.
             * @api private
             */

            WS.prototype.write = function (packets) {
                var self = this;
                this.writable = false;
                // encodePacket efficient as it uses WS framing
                // no need for encodePayload
                for (var i = 0, l = packets.length; i < l; i++) {
                    parser.encodePacket(packets[i], this.supportsBinary, function (data) {
                        //Sometimes the websocket has already been closed but the browser didn't
                        //have a chance of informing us about it yet, in that case send will
                        //throw an error
                        try {
                            self.ws.send(data);
                        } catch (e) {
                            debug('websocket closed before onclose event');
                        }
                    });
                }

                function ondrain() {
                    self.writable = true;
                    self.emit('drain');
                }
                // fake drain
                // defer to next tick to allow Socket to clear writeBuffer
                setTimeout(ondrain, 0);
            };

            /**
             * Called upon close
             *
             * @api private
             */

            WS.prototype.onClose = function () {
                Transport.prototype.onClose.call(this);
            };

            /**
             * Closes socket.
             *
             * @api private
             */

            WS.prototype.doClose = function () {
                if (typeof this.ws !== 'undefined') {
                    this.ws.close();
                }
            };

            /**
             * Generates uri for connection.
             *
             * @api private
             */

            WS.prototype.uri = function () {
                var query = this.query || {};
                var schema = this.secure ? 'wss' : 'ws';
                var port = '';

                // avoid port if default for schema
                if (this.port && (('wss' == schema && this.port != 443)
                  || ('ws' == schema && this.port != 80))) {
                    port = ':' + this.port;
                }

                // append timestamp to URI
                if (this.timestampRequests) {
                    query[this.timestampParam] = +new Date;
                }

                // communicate binary support capabilities
                if (!this.supportsBinary) {
                    query.b64 = 1;
                }

                query = parseqs.encode(query);

                // prepend ? to query
                if (query.length) {
                    query = '?' + query;
                }

                return schema + '://' + this.hostname + port + this.path + query;
            };

            /**
             * Feature detection for WebSocket.
             *
             * @return {Boolean} whether this transport is available.
             * @api public
             */

            WS.prototype.check = function () {
                return !!WebSocket && !('__initialize' in WebSocket && this.name === WS.prototype.name);
            };

        }, { "../transport": 14, "component-inherit": 21, "debug": 22, "engine.io-parser": 25, "parseqs": 35, "ws": 37 }], 20: [function (_dereq_, module, exports) {
            // browser shim for xmlhttprequest module
            var hasCORS = _dereq_('has-cors');

            module.exports = function (opts) {
                var xdomain = opts.xdomain;

                // scheme must be same when usign XDomainRequest
                // http://blogs.msdn.com/b/ieinternals/archive/2010/05/13/xdomainrequest-restrictions-limitations-and-workarounds.aspx
                var xscheme = opts.xscheme;

                // XDomainRequest has a flow of not sending cookie, therefore it should be disabled as a default.
                // https://github.com/Automattic/engine.io-client/pull/217
                var enablesXDR = opts.enablesXDR;

                // XMLHttpRequest can be disabled on IE
                try {
                    if ('undefined' != typeof XMLHttpRequest && (!xdomain || hasCORS)) {
                        return new XMLHttpRequest();
                    }
                } catch (e) { }

                // Use XDomainRequest for IE8 if enablesXDR is true
                // because loading bar keeps flashing when using jsonp-polling
                // https://github.com/yujiosaka/socke.io-ie8-loading-example
                try {
                    if ('undefined' != typeof XDomainRequest && !xscheme && enablesXDR) {
                        return new XDomainRequest();
                    }
                } catch (e) { }

                if (!xdomain) {
                    try {
                        return new ActiveXObject('Microsoft.XMLHTTP');
                    } catch (e) { }
                }
            }

        }, { "has-cors": 40 }], 21: [function (_dereq_, module, exports) {

            module.exports = function (a, b) {
                var fn = function () { };
                fn.prototype = b.prototype;
                a.prototype = new fn;
                a.prototype.constructor = a;
            };
        }, {}], 22: [function (_dereq_, module, exports) {

            /**
             * This is the web browser implementation of `debug()`.
             *
             * Expose `debug()` as the module.
             */

            exports = module.exports = _dereq_('./debug');
            exports.log = log;
            exports.formatArgs = formatArgs;
            exports.save = save;
            exports.load = load;
            exports.useColors = useColors;

            /**
             * Colors.
             */

            exports.colors = [
              'lightseagreen',
              'forestgreen',
              'goldenrod',
              'dodgerblue',
              'darkorchid',
              'crimson'
            ];

            /**
             * Currently only WebKit-based Web Inspectors, Firefox >= v31,
             * and the Firebug extension (any Firefox version) are known
             * to support "%c" CSS customizations.
             *
             * TODO: add a `localStorage` variable to explicitly enable/disable colors
             */

            function useColors() {
                // is webkit? http://stackoverflow.com/a/16459606/376773
                return ('WebkitAppearance' in document.documentElement.style) ||
                  // is firebug? http://stackoverflow.com/a/398120/376773
                  (window.console && (console.firebug || (console.exception && console.table))) ||
                  // is firefox >= v31?
                  // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
                  (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
            }

            /**
             * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
             */

            exports.formatters.j = function (v) {
                return JSON.stringify(v);
            };


            /**
             * Colorize log arguments if enabled.
             *
             * @api public
             */

            function formatArgs() {
                var args = arguments;
                var useColors = this.useColors;

                args[0] = (useColors ? '%c' : '')
                  + this.namespace
                  + (useColors ? ' %c' : ' ')
                  + args[0]
                  + (useColors ? '%c ' : ' ')
                  + '+' + exports.humanize(this.diff);

                if (!useColors) return args;

                var c = 'color: ' + this.color;
                args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

                // the final "%c" is somewhat tricky, because there could be other
                // arguments passed either before or after the %c, so we need to
                // figure out the correct index to insert the CSS into
                var index = 0;
                var lastC = 0;
                args[0].replace(/%[a-z%]/g, function (match) {
                    if ('%' === match) return;
                    index++;
                    if ('%c' === match) {
                        // we only are interested in the *last* %c
                        // (the user may have provided their own)
                        lastC = index;
                    }
                });

                args.splice(lastC, 0, c);
                return args;
            }

            /**
             * Invokes `console.log()` when available.
             * No-op when `console.log` is not a "function".
             *
             * @api public
             */

            function log() {
                // This hackery is required for IE8,
                // where the `console.log` function doesn't have 'apply'
                return 'object' == typeof console
                  && 'function' == typeof console.log
                  && Function.prototype.apply.call(console.log, console, arguments);
            }

            /**
             * Save `namespaces`.
             *
             * @param {String} namespaces
             * @api private
             */

            function save(namespaces) {
                try {
                    if (null == namespaces) {
                        localStorage.removeItem('debug');
                    } else {
                        localStorage.debug = namespaces;
                    }
                } catch (e) { }
            }

            /**
             * Load `namespaces`.
             *
             * @return {String} returns the previously persisted debug modes
             * @api private
             */

            function load() {
                var r;
                try {
                    r = localStorage.debug;
                } catch (e) { }
                return r;
            }

            /**
             * Enable namespaces listed in `localStorage.debug` initially.
             */

            exports.enable(load());

        }, { "./debug": 23 }], 23: [function (_dereq_, module, exports) {

            /**
             * This is the common logic for both the Node.js and web browser
             * implementations of `debug()`.
             *
             * Expose `debug()` as the module.
             */

            exports = module.exports = debug;
            exports.coerce = coerce;
            exports.disable = disable;
            exports.enable = enable;
            exports.enabled = enabled;
            exports.humanize = _dereq_('ms');

            /**
             * The currently active debug mode names, and names to skip.
             */

            exports.names = [];
            exports.skips = [];

            /**
             * Map of special "%n" handling functions, for the debug "format" argument.
             *
             * Valid key names are a single, lowercased letter, i.e. "n".
             */

            exports.formatters = {};

            /**
             * Previously assigned color.
             */

            var prevColor = 0;

            /**
             * Previous log timestamp.
             */

            var prevTime;

            /**
             * Select a color.
             *
             * @return {Number}
             * @api private
             */

            function selectColor() {
                return exports.colors[prevColor++ % exports.colors.length];
            }

            /**
             * Create a debugger with the given `namespace`.
             *
             * @param {String} namespace
             * @return {Function}
             * @api public
             */

            function debug(namespace) {

                // define the `disabled` version
                function disabled() {
                }
                disabled.enabled = false;

                // define the `enabled` version
                function enabled() {

                    var self = enabled;

                    // set `diff` timestamp
                    var curr = +new Date();
                    var ms = curr - (prevTime || curr);
                    self.diff = ms;
                    self.prev = prevTime;
                    self.curr = curr;
                    prevTime = curr;

                    // add the `color` if not set
                    if (null == self.useColors) self.useColors = exports.useColors();
                    if (null == self.color && self.useColors) self.color = selectColor();

                    var args = Array.prototype.slice.call(arguments);

                    args[0] = exports.coerce(args[0]);

                    if ('string' !== typeof args[0]) {
                        // anything else let's inspect with %o
                        args = ['%o'].concat(args);
                    }

                    // apply any `formatters` transformations
                    var index = 0;
                    args[0] = args[0].replace(/%([a-z%])/g, function (match, format) {
                        // if we encounter an escaped % then don't increase the array index
                        if (match === '%') return match;
                        index++;
                        var formatter = exports.formatters[format];
                        if ('function' === typeof formatter) {
                            var val = args[index];
                            match = formatter.call(self, val);

                            // now we need to remove `args[index]` since it's inlined in the `format`
                            args.splice(index, 1);
                            index--;
                        }
                        return match;
                    });

                    if ('function' === typeof exports.formatArgs) {
                        args = exports.formatArgs.apply(self, args);
                    }
                    var logFn = enabled.log || exports.log || console.log.bind(console);
                    logFn.apply(self, args);
                }
                enabled.enabled = true;

                var fn = exports.enabled(namespace) ? enabled : disabled;

                fn.namespace = namespace;

                return fn;
            }

            /**
             * Enables a debug mode by namespaces. This can include modes
             * separated by a colon and wildcards.
             *
             * @param {String} namespaces
             * @api public
             */

            function enable(namespaces) {
                exports.save(namespaces);

                var split = (namespaces || '').split(/[\s,]+/);
                var len = split.length;

                for (var i = 0; i < len; i++) {
                    if (!split[i]) continue; // ignore empty strings
                    namespaces = split[i].replace(/\*/g, '.*?');
                    if (namespaces[0] === '-') {
                        exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
                    } else {
                        exports.names.push(new RegExp('^' + namespaces + '$'));
                    }
                }
            }

            /**
             * Disable debug output.
             *
             * @api public
             */

            function disable() {
                exports.enable('');
            }

            /**
             * Returns true if the given mode name is enabled, false otherwise.
             *
             * @param {String} name
             * @return {Boolean}
             * @api public
             */

            function enabled(name) {
                var i, len;
                for (i = 0, len = exports.skips.length; i < len; i++) {
                    if (exports.skips[i].test(name)) {
                        return false;
                    }
                }
                for (i = 0, len = exports.names.length; i < len; i++) {
                    if (exports.names[i].test(name)) {
                        return true;
                    }
                }
                return false;
            }

            /**
             * Coerce `val`.
             *
             * @param {Mixed} val
             * @return {Mixed}
             * @api private
             */

            function coerce(val) {
                if (val instanceof Error) return val.stack || val.message;
                return val;
            }

        }, { "ms": 24 }], 24: [function (_dereq_, module, exports) {
            /**
             * Helpers.
             */

            var s = 1000;
            var m = s * 60;
            var h = m * 60;
            var d = h * 24;
            var y = d * 365.25;

            /**
             * Parse or format the given `val`.
             *
             * Options:
             *
             *  - `long` verbose formatting [false]
             *
             * @param {String|Number} val
             * @param {Object} options
             * @return {String|Number}
             * @api public
             */

            module.exports = function (val, options) {
                options = options || {};
                if ('string' == typeof val) return parse(val);
                return options.long
                  ? long(val)
                  : short(val);
            };

            /**
             * Parse the given `str` and return milliseconds.
             *
             * @param {String} str
             * @return {Number}
             * @api private
             */

            function parse(str) {
                var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
                if (!match) return;
                var n = parseFloat(match[1]);
                var type = (match[2] || 'ms').toLowerCase();
                switch (type) {
                    case 'years':
                    case 'year':
                    case 'y':
                        return n * y;
                    case 'days':
                    case 'day':
                    case 'd':
                        return n * d;
                    case 'hours':
                    case 'hour':
                    case 'h':
                        return n * h;
                    case 'minutes':
                    case 'minute':
                    case 'm':
                        return n * m;
                    case 'seconds':
                    case 'second':
                    case 's':
                        return n * s;
                    case 'ms':
                        return n;
                }
            }

            /**
             * Short format for `ms`.
             *
             * @param {Number} ms
             * @return {String}
             * @api private
             */

            function short(ms) {
                if (ms >= d) return Math.round(ms / d) + 'd';
                if (ms >= h) return Math.round(ms / h) + 'h';
                if (ms >= m) return Math.round(ms / m) + 'm';
                if (ms >= s) return Math.round(ms / s) + 's';
                return ms + 'ms';
            }

            /**
             * Long format for `ms`.
             *
             * @param {Number} ms
             * @return {String}
             * @api private
             */

            function long(ms) {
                return plural(ms, d, 'day')
                  || plural(ms, h, 'hour')
                  || plural(ms, m, 'minute')
                  || plural(ms, s, 'second')
                  || ms + ' ms';
            }

            /**
             * Pluralization helper.
             */

            function plural(ms, n, name) {
                if (ms < n) return;
                if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
                return Math.ceil(ms / n) + ' ' + name + 's';
            }

        }, {}], 25: [function (_dereq_, module, exports) {
            (function (global) {
                /**
                 * Module dependencies.
                 */

                var keys = _dereq_('./keys');
                var hasBinary = _dereq_('has-binary');
                var sliceBuffer = _dereq_('arraybuffer.slice');
                var base64encoder = _dereq_('base64-arraybuffer');
                var after = _dereq_('after');
                var utf8 = _dereq_('utf8');

                /**
                 * Check if we are running an android browser. That requires us to use
                 * ArrayBuffer with polling transports...
                 *
                 * http://ghinda.net/jpeg-blob-ajax-android/
                 */

                var isAndroid = navigator.userAgent.match(/Android/i);

                /**
                 * Check if we are running in PhantomJS.
                 * Uploading a Blob with PhantomJS does not work correctly, as reported here:
                 * https://github.com/ariya/phantomjs/issues/11395
                 * @type boolean
                 */
                var isPhantomJS = /PhantomJS/i.test(navigator.userAgent);

                /**
                 * When true, avoids using Blobs to encode payloads.
                 * @type boolean
                 */
                var dontSendBlobs = isAndroid || isPhantomJS;

                /**
                 * Current protocol version.
                 */

                exports.protocol = 3;

                /**
                 * Packet types.
                 */

                var packets = exports.packets = {
                    open: 0    // non-ws
                  , close: 1    // non-ws
                  , ping: 2
                  , pong: 3
                  , message: 4
                  , upgrade: 5
                  , noop: 6
                };

                var packetslist = keys(packets);

                /**
                 * Premade error packet.
                 */

                var err = { type: 'error', data: 'parser error' };

                /**
                 * Create a blob api even for blob builder when vendor prefixes exist
                 */

                var Blob = _dereq_('blob');

                /**
                 * Encodes a packet.
                 *
                 *     <packet type id> [ <data> ]
                 *
                 * Example:
                 *
                 *     5hello world
                 *     3
                 *     4
                 *
                 * Binary is encoded in an identical principle
                 *
                 * @api private
                 */

                exports.encodePacket = function (packet, supportsBinary, utf8encode, Callback) {
                    if ('function' == typeof supportsBinary) {
                        Callback = supportsBinary;
                        supportsBinary = false;
                    }

                    if ('function' == typeof utf8encode) {
                        Callback = utf8encode;
                        utf8encode = null;
                    }

                    var data = (packet.data === undefined)
                      ? undefined
                      : packet.data.buffer || packet.data;

                    if (global.ArrayBuffer && data instanceof ArrayBuffer) {
                        return encodeArrayBuffer(packet, supportsBinary, Callback);
                    } else if (Blob && data instanceof global.Blob) {
                        return encodeBlob(packet, supportsBinary, Callback);
                    }

                    // might be an object with { base64: true, data: dataAsBase64String }
                    if (data && data.base64) {
                        return encodeBase64Object(packet, Callback);
                    }

                    // Sending data as a utf-8 string
                    var encoded = packets[packet.type];

                    // data fragment is optional
                    if (undefined !== packet.data) {
                        encoded += utf8encode ? utf8.encode(String(packet.data)) : String(packet.data);
                    }

                    return Callback('' + encoded);

                };

                function encodeBase64Object(packet, Callback) {
                    // packet data is an object { base64: true, data: dataAsBase64String }
                    var message = 'b' + exports.packets[packet.type] + packet.data.data;
                    return Callback(message);
                }

                /**
                 * Encode packet helpers for binary types
                 */

                function encodeArrayBuffer(packet, supportsBinary, Callback) {
                    if (!supportsBinary) {
                        return exports.encodeBase64Packet(packet, Callback);
                    }

                    var data = packet.data;
                    var contentArray = new Uint8Array(data);
                    var resultBuffer = new Uint8Array(1 + data.byteLength);

                    resultBuffer[0] = packets[packet.type];
                    for (var i = 0; i < contentArray.length; i++) {
                        resultBuffer[i + 1] = contentArray[i];
                    }

                    return Callback(resultBuffer.buffer);
                }

                function encodeBlobAsArrayBuffer(packet, supportsBinary, Callback) {
                    if (!supportsBinary) {
                        return exports.encodeBase64Packet(packet, Callback);
                    }

                    var fr = new FileReader();
                    fr.onload = function () {
                        packet.data = fr.result;
                        exports.encodePacket(packet, supportsBinary, true, Callback);
                    };
                    return fr.readAsArrayBuffer(packet.data);
                }

                function encodeBlob(packet, supportsBinary, Callback) {
                    if (!supportsBinary) {
                        return exports.encodeBase64Packet(packet, Callback);
                    }

                    if (dontSendBlobs) {
                        return encodeBlobAsArrayBuffer(packet, supportsBinary, Callback);
                    }

                    var length = new Uint8Array(1);
                    length[0] = packets[packet.type];
                    var blob = new Blob([length.buffer, packet.data]);

                    return Callback(blob);
                }

                /**
                 * Encodes a packet with binary data in a base64 string
                 *
                 * @param {Object} packet, has `type` and `data`
                 * @return {String} base64 encoded message
                 */

                exports.encodeBase64Packet = function (packet, Callback) {
                    var message = 'b' + exports.packets[packet.type];
                    if (Blob && packet.data instanceof Blob) {
                        var fr = new FileReader();
                        fr.onload = function () {
                            var b64 = fr.result.split(',')[1];
                            Callback(message + b64);
                        };
                        return fr.readAsDataURL(packet.data);
                    }

                    var b64data;
                    try {
                        b64data = String.fromCharCode.apply(null, new Uint8Array(packet.data));
                    } catch (e) {
                        // iPhone Safari doesn't let you apply with typed arrays
                        var typed = new Uint8Array(packet.data);
                        var basic = new Array(typed.length);
                        for (var i = 0; i < typed.length; i++) {
                            basic[i] = typed[i];
                        }
                        b64data = String.fromCharCode.apply(null, basic);
                    }
                    message += global.btoa(b64data);
                    return Callback(message);
                };

                /**
                 * Decodes a packet. Changes format to Blob if requested.
                 *
                 * @return {Object} with `type` and `data` (if any)
                 * @api private
                 */

                exports.decodePacket = function (data, binaryType, utf8decode) {
                    // String data
                    if (typeof data == 'string' || data === undefined) {
                        if (data.charAt(0) == 'b') {
                            return exports.decodeBase64Packet(data.substr(1), binaryType);
                        }

                        if (utf8decode) {
                            try {
                                data = utf8.decode(data);
                            } catch (e) {
                                return err;
                            }
                        }
                        var type = data.charAt(0);

                        if (Number(type) != type || !packetslist[type]) {
                            return err;
                        }

                        if (data.length > 1) {
                            return { type: packetslist[type], data: data.substring(1) };
                        } else {
                            return { type: packetslist[type] };
                        }
                    }

                    var asArray = new Uint8Array(data);
                    var type = asArray[0];
                    var rest = sliceBuffer(data, 1);
                    if (Blob && binaryType === 'blob') {
                        rest = new Blob([rest]);
                    }
                    return { type: packetslist[type], data: rest };
                };

                /**
                 * Decodes a packet encoded in a base64 string
                 *
                 * @param {String} base64 encoded message
                 * @return {Object} with `type` and `data` (if any)
                 */

                exports.decodeBase64Packet = function (msg, binaryType) {
                    var type = packetslist[msg.charAt(0)];
                    if (!global.ArrayBuffer) {
                        return { type: type, data: { base64: true, data: msg.substr(1) } };
                    }

                    var data = base64encoder.decode(msg.substr(1));

                    if (binaryType === 'blob' && Blob) {
                        data = new Blob([data]);
                    }

                    return { type: type, data: data };
                };

                /**
                 * Encodes multiple messages (payload).
                 *
                 *     <length>:data
                 *
                 * Example:
                 *
                 *     11:hello world2:hi
                 *
                 * If any contents are binary, they will be encoded as base64 strings. Base64
                 * encoded strings are marked with a b before the length specifier
                 *
                 * @param {Array} packets
                 * @api private
                 */

                exports.encodePayload = function (packets, supportsBinary, Callback) {
                    if (typeof supportsBinary == 'function') {
                        Callback = supportsBinary;
                        supportsBinary = null;
                    }

                    var isBinary = hasBinary(packets);

                    if (supportsBinary && isBinary) {
                        if (Blob && !dontSendBlobs) {
                            return exports.encodePayloadAsBlob(packets, Callback);
                        }

                        return exports.encodePayloadAsArrayBuffer(packets, Callback);
                    }

                    if (!packets.length) {
                        return Callback('0:');
                    }

                    function setLengthHeader(message) {
                        return message.length + ':' + message;
                    }

                    function encodeOne(packet, doneCallback) {
                        exports.encodePacket(packet, !isBinary ? false : supportsBinary, true, function (message) {
                            doneCallback(null, setLengthHeader(message));
                        });
                    }

                    map(packets, encodeOne, function (err, results) {
                        return Callback(results.join(''));
                    });
                };

                /**
                 * Async array map using after
                 */

                function map(ary, each, done) {
                    var result = new Array(ary.length);
                    var next = after(ary.length, done);

                    var eachWithIndex = function (i, el, cb) {
                        each(el, function (error, msg) {
                            result[i] = msg;
                            cb(error, result);
                        });
                    };

                    for (var i = 0; i < ary.length; i++) {
                        eachWithIndex(i, ary[i], next);
                    }
                }

                /*
                 * Decodes data when a payload is maybe expected. Possible binary contents are
                 * decoded from their base64 representation
                 *
                 * @param {String} data, Callback method
                 * @api public
                 */

                exports.decodePayload = function (data, binaryType, Callback) {
                    if (typeof data != 'string') {
                        return exports.decodePayloadAsBinary(data, binaryType, Callback);
                    }

                    if (typeof binaryType === 'function') {
                        Callback = binaryType;
                        binaryType = null;
                    }

                    var packet;
                    if (data == '') {
                        // parser error - ignoring payload
                        return Callback(err, 0, 1);
                    }

                    var length = ''
                      , n, msg;

                    for (var i = 0, l = data.length; i < l; i++) {
                        var chr = data.charAt(i);

                        if (':' != chr) {
                            length += chr;
                        } else {
                            if ('' == length || (length != (n = Number(length)))) {
                                // parser error - ignoring payload
                                return Callback(err, 0, 1);
                            }

                            msg = data.substr(i + 1, n);

                            if (length != msg.length) {
                                // parser error - ignoring payload
                                return Callback(err, 0, 1);
                            }

                            if (msg.length) {
                                packet = exports.decodePacket(msg, binaryType, true);

                                if (err.type == packet.type && err.data == packet.data) {
                                    // parser error in individual packet - ignoring payload
                                    return Callback(err, 0, 1);
                                }

                                var ret = Callback(packet, i + n, l);
                                if (false === ret) return;
                            }

                            // advance cursor
                            i += n;
                            length = '';
                        }
                    }

                    if (length != '') {
                        // parser error - ignoring payload
                        return Callback(err, 0, 1);
                    }

                };

                /**
                 * Encodes multiple messages (payload) as binary.
                 *
                 * <1 = binary, 0 = string><number from 0-9><number from 0-9>[...]<number
                 * 255><data>
                 *
                 * Example:
                 * 1 3 255 1 2 3, if the binary contents are interpreted as 8 bit integers
                 *
                 * @param {Array} packets
                 * @return {ArrayBuffer} encoded payload
                 * @api private
                 */

                exports.encodePayloadAsArrayBuffer = function (packets, Callback) {
                    if (!packets.length) {
                        return Callback(new ArrayBuffer(0));
                    }

                    function encodeOne(packet, doneCallback) {
                        exports.encodePacket(packet, true, true, function (data) {
                            return doneCallback(null, data);
                        });
                    }

                    map(packets, encodeOne, function (err, encodedPackets) {
                        var totalLength = encodedPackets.reduce(function (acc, p) {
                            var len;
                            if (typeof p === 'string') {
                                len = p.length;
                            } else {
                                len = p.byteLength;
                            }
                            return acc + len.toString().length + len + 2; // string/binary identifier + separator = 2
                        }, 0);

                        var resultArray = new Uint8Array(totalLength);

                        var bufferIndex = 0;
                        encodedPackets.forEach(function (p) {
                            var isString = typeof p === 'string';
                            var ab = p;
                            if (isString) {
                                var view = new Uint8Array(p.length);
                                for (var i = 0; i < p.length; i++) {
                                    view[i] = p.charCodeAt(i);
                                }
                                ab = view.buffer;
                            }

                            if (isString) { // not true binary
                                resultArray[bufferIndex++] = 0;
                            } else { // true binary
                                resultArray[bufferIndex++] = 1;
                            }

                            var lenStr = ab.byteLength.toString();
                            for (var i = 0; i < lenStr.length; i++) {
                                resultArray[bufferIndex++] = parseInt(lenStr[i]);
                            }
                            resultArray[bufferIndex++] = 255;

                            var view = new Uint8Array(ab);
                            for (var i = 0; i < view.length; i++) {
                                resultArray[bufferIndex++] = view[i];
                            }
                        });

                        return Callback(resultArray.buffer);
                    });
                };

                /**
                 * Encode as Blob
                 */

                exports.encodePayloadAsBlob = function (packets, Callback) {
                    function encodeOne(packet, doneCallback) {
                        exports.encodePacket(packet, true, true, function (encoded) {
                            var binaryIdentifier = new Uint8Array(1);
                            binaryIdentifier[0] = 1;
                            if (typeof encoded === 'string') {
                                var view = new Uint8Array(encoded.length);
                                for (var i = 0; i < encoded.length; i++) {
                                    view[i] = encoded.charCodeAt(i);
                                }
                                encoded = view.buffer;
                                binaryIdentifier[0] = 0;
                            }

                            var len = (encoded instanceof ArrayBuffer)
                              ? encoded.byteLength
                              : encoded.size;

                            var lenStr = len.toString();
                            var lengthAry = new Uint8Array(lenStr.length + 1);
                            for (var i = 0; i < lenStr.length; i++) {
                                lengthAry[i] = parseInt(lenStr[i]);
                            }
                            lengthAry[lenStr.length] = 255;

                            if (Blob) {
                                var blob = new Blob([binaryIdentifier.buffer, lengthAry.buffer, encoded]);
                                doneCallback(null, blob);
                            }
                        });
                    }

                    map(packets, encodeOne, function (err, results) {
                        return Callback(new Blob(results));
                    });
                };

                /*
                 * Decodes data when a payload is maybe expected. Strings are decoded by
                 * interpreting each byte as a key code for entries marked to start with 0. See
                 * description of encodePayloadAsBinary
                 *
                 * @param {ArrayBuffer} data, Callback method
                 * @api public
                 */

                exports.decodePayloadAsBinary = function (data, binaryType, Callback) {
                    if (typeof binaryType === 'function') {
                        Callback = binaryType;
                        binaryType = null;
                    }

                    var bufferTail = data;
                    var buffers = [];

                    var numberTooLong = false;
                    while (bufferTail.byteLength > 0) {
                        var tailArray = new Uint8Array(bufferTail);
                        var isString = tailArray[0] === 0;
                        var msgLength = '';

                        for (var i = 1; ; i++) {
                            if (tailArray[i] == 255) break;

                            if (msgLength.length > 310) {
                                numberTooLong = true;
                                break;
                            }

                            msgLength += tailArray[i];
                        }

                        if (numberTooLong) return Callback(err, 0, 1);

                        bufferTail = sliceBuffer(bufferTail, 2 + msgLength.length);
                        msgLength = parseInt(msgLength);

                        var msg = sliceBuffer(bufferTail, 0, msgLength);
                        if (isString) {
                            try {
                                msg = String.fromCharCode.apply(null, new Uint8Array(msg));
                            } catch (e) {
                                // iPhone Safari doesn't let you apply to typed arrays
                                var typed = new Uint8Array(msg);
                                msg = '';
                                for (var i = 0; i < typed.length; i++) {
                                    msg += String.fromCharCode(typed[i]);
                                }
                            }
                        }

                        buffers.push(msg);
                        bufferTail = sliceBuffer(bufferTail, msgLength);
                    }

                    var total = buffers.length;
                    buffers.forEach(function (buffer, i) {
                        Callback(exports.decodePacket(buffer, binaryType, true), i, total);
                    });
                };

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "./keys": 26, "after": 27, "arraybuffer.slice": 28, "base64-arraybuffer": 29, "blob": 30, "has-binary": 31, "utf8": 33 }], 26: [function (_dereq_, module, exports) {

            /**
             * Gets the keys for an object.
             *
             * @return {Array} keys
             * @api private
             */

            module.exports = Object.keys || function keys(obj) {
                var arr = [];
                var has = Object.prototype.hasOwnProperty;

                for (var i in obj) {
                    if (has.call(obj, i)) {
                        arr.push(i);
                    }
                }
                return arr;
            };

        }, {}], 27: [function (_dereq_, module, exports) {
            module.exports = after

            function after(count, Callback, err_cb) {
                var bail = false
                err_cb = err_cb || noop
                proxy.count = count

                return (count === 0) ? Callback() : proxy

                function proxy(err, result) {
                    if (proxy.count <= 0) {
                        throw new Error('after called too many times')
                    }
                    --proxy.count

                    // after first error, rest are passed to err_cb
                    if (err) {
                        bail = true
                        Callback(err)
                        // future error Callbacks will go to error handler
                        Callback = err_cb
                    } else if (proxy.count === 0 && !bail) {
                        Callback(null, result)
                    }
                }
            }

            function noop() { }

        }, {}], 28: [function (_dereq_, module, exports) {
            /**
             * An abstraction for slicing an arraybuffer even when
             * ArrayBuffer.prototype.slice is not supported
             *
             * @api public
             */

            module.exports = function (arraybuffer, start, end) {
                var bytes = arraybuffer.byteLength;
                start = start || 0;
                end = end || bytes;

                if (arraybuffer.slice) { return arraybuffer.slice(start, end); }

                if (start < 0) { start += bytes; }
                if (end < 0) { end += bytes; }
                if (end > bytes) { end = bytes; }

                if (start >= bytes || start >= end || bytes === 0) {
                    return new ArrayBuffer(0);
                }

                var abv = new Uint8Array(arraybuffer);
                var result = new Uint8Array(end - start);
                for (var i = start, ii = 0; i < end; i++, ii++) {
                    result[ii] = abv[i];
                }
                return result.buffer;
            };

        }, {}], 29: [function (_dereq_, module, exports) {
            /*
             * base64-arraybuffer
             * https://github.com/niklasvh/base64-arraybuffer
             *
             * Copyright (c) 2012 Niklas von Hertzen
             * Licensed under the MIT license.
             */
            (function (chars) {
                "use strict";

                exports.encode = function (arraybuffer) {
                    var bytes = new Uint8Array(arraybuffer),
                    i, len = bytes.length, base64 = "";

                    for (i = 0; i < len; i += 3) {
                        base64 += chars[bytes[i] >> 2];
                        base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
                        base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
                        base64 += chars[bytes[i + 2] & 63];
                    }

                    if ((len % 3) === 2) {
                        base64 = base64.substring(0, base64.length - 1) + "=";
                    } else if (len % 3 === 1) {
                        base64 = base64.substring(0, base64.length - 2) + "==";
                    }

                    return base64;
                };

                exports.decode = function (base64) {
                    var bufferLength = base64.length * 0.75,
                    len = base64.length, i, p = 0,
                    encoded1, encoded2, encoded3, encoded4;

                    if (base64[base64.length - 1] === "=") {
                        bufferLength--;
                        if (base64[base64.length - 2] === "=") {
                            bufferLength--;
                        }
                    }

                    var arraybuffer = new ArrayBuffer(bufferLength),
                    bytes = new Uint8Array(arraybuffer);

                    for (i = 0; i < len; i += 4) {
                        encoded1 = chars.indexOf(base64[i]);
                        encoded2 = chars.indexOf(base64[i + 1]);
                        encoded3 = chars.indexOf(base64[i + 2]);
                        encoded4 = chars.indexOf(base64[i + 3]);

                        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
                        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
                        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
                    }

                    return arraybuffer;
                };
            })("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");

        }, {}], 30: [function (_dereq_, module, exports) {
            (function (global) {
                /**
                 * Create a blob builder even when vendor prefixes exist
                 */

                var BlobBuilder = global.BlobBuilder
                  || global.WebKitBlobBuilder
                  || global.MSBlobBuilder
                  || global.MozBlobBuilder;

                /**
                 * Check if Blob constructor is supported
                 */

                var blobSupported = (function () {
                    try {
                        var b = new Blob(['hi']);
                        return b.size == 2;
                    } catch (e) {
                        return false;
                    }
                })();

                /**
                 * Check if BlobBuilder is supported
                 */

                var blobBuilderSupported = BlobBuilder
                  && BlobBuilder.prototype.append
                  && BlobBuilder.prototype.getBlob;

                function BlobBuilderConstructor(ary, options) {
                    options = options || {};

                    var bb = new BlobBuilder();
                    for (var i = 0; i < ary.length; i++) {
                        bb.append(ary[i]);
                    }
                    return (options.type) ? bb.getBlob(options.type) : bb.getBlob();
                };

                module.exports = (function () {
                    if (blobSupported) {
                        return global.Blob;
                    } else if (blobBuilderSupported) {
                        return BlobBuilderConstructor;
                    } else {
                        return undefined;
                    }
                })();

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}], 31: [function (_dereq_, module, exports) {
            (function (global) {

                /*
                 * Module requirements.
                 */

                var isArray = _dereq_('isarray');

                /**
                 * Module exports.
                 */

                module.exports = hasBinary;

                /**
                 * Checks for binary data.
                 *
                 * Right now only Buffer and ArrayBuffer are supported..
                 *
                 * @param {Object} anything
                 * @api public
                 */

                function hasBinary(data) {

                    function _hasBinary(obj) {
                        if (!obj) return false;

                        if ((global.Buffer && global.Buffer.isBuffer(obj)) ||
                             (global.ArrayBuffer && obj instanceof ArrayBuffer) ||
                             (global.Blob && obj instanceof Blob) ||
                             (global.File && obj instanceof File)
                            ) {
                            return true;
                        }

                        if (isArray(obj)) {
                            for (var i = 0; i < obj.length; i++) {
                                if (_hasBinary(obj[i])) {
                                    return true;
                                }
                            }
                        } else if (obj && 'object' == typeof obj) {
                            if (obj.toJSON) {
                                obj = obj.toJSON();
                            }

                            for (var key in obj) {
                                if (obj.hasOwnProperty(key) && _hasBinary(obj[key])) {
                                    return true;
                                }
                            }
                        }

                        return false;
                    }

                    return _hasBinary(data);
                }

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "isarray": 32 }], 32: [function (_dereq_, module, exports) {
            module.exports = Array.isArray || function (arr) {
                return Object.prototype.toString.call(arr) == '[object Array]';
            };

        }, {}], 33: [function (_dereq_, module, exports) {
            (function (global) {
                /*! http://mths.be/utf8js v2.0.0 by @mathias */
                ; (function (root) {

                    // Detect free variables `exports`
                    var freeExports = typeof exports == 'object' && exports;

                    // Detect free variable `module`
                    var freeModule = typeof module == 'object' && module &&
                        module.exports == freeExports && module;

                    // Detect free variable `global`, from Node.js or Browserified code,
                    // and use it as `root`
                    var freeGlobal = typeof global == 'object' && global;
                    if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
                        root = freeGlobal;
                    }

                    /*--------------------------------------------------------------------------*/

                    var stringFromCharCode = String.fromCharCode;

                    // Taken from http://mths.be/punycode
                    function ucs2decode(string) {
                        var output = [];
                        var counter = 0;
                        var length = string.length;
                        var value;
                        var extra;
                        while (counter < length) {
                            value = string.charCodeAt(counter++);
                            if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
                                // high surrogate, and there is a next character
                                extra = string.charCodeAt(counter++);
                                if ((extra & 0xFC00) == 0xDC00) { // low surrogate
                                    output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
                                } else {
                                    // unmatched surrogate; only append this code unit, in case the next
                                    // code unit is the high surrogate of a surrogate pair
                                    output.push(value);
                                    counter--;
                                }
                            } else {
                                output.push(value);
                            }
                        }
                        return output;
                    }

                    // Taken from http://mths.be/punycode
                    function ucs2encode(array) {
                        var length = array.length;
                        var index = -1;
                        var value;
                        var output = '';
                        while (++index < length) {
                            value = array[index];
                            if (value > 0xFFFF) {
                                value -= 0x10000;
                                output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
                                value = 0xDC00 | value & 0x3FF;
                            }
                            output += stringFromCharCode(value);
                        }
                        return output;
                    }

                    /*--------------------------------------------------------------------------*/

                    function createByte(codePoint, shift) {
                        return stringFromCharCode(((codePoint >> shift) & 0x3F) | 0x80);
                    }

                    function encodeCodePoint(codePoint) {
                        if ((codePoint & 0xFFFFFF80) == 0) { // 1-byte sequence
                            return stringFromCharCode(codePoint);
                        }
                        var symbol = '';
                        if ((codePoint & 0xFFFFF800) == 0) { // 2-byte sequence
                            symbol = stringFromCharCode(((codePoint >> 6) & 0x1F) | 0xC0);
                        }
                        else if ((codePoint & 0xFFFF0000) == 0) { // 3-byte sequence
                            symbol = stringFromCharCode(((codePoint >> 12) & 0x0F) | 0xE0);
                            symbol += createByte(codePoint, 6);
                        }
                        else if ((codePoint & 0xFFE00000) == 0) { // 4-byte sequence
                            symbol = stringFromCharCode(((codePoint >> 18) & 0x07) | 0xF0);
                            symbol += createByte(codePoint, 12);
                            symbol += createByte(codePoint, 6);
                        }
                        symbol += stringFromCharCode((codePoint & 0x3F) | 0x80);
                        return symbol;
                    }

                    function utf8encode(string) {
                        var codePoints = ucs2decode(string);

                        // console.log(JSON.stringify(codePoints.map(function(x) {
                        // 	return 'U+' + x.toString(16).toUpperCase();
                        // })));

                        var length = codePoints.length;
                        var index = -1;
                        var codePoint;
                        var byteString = '';
                        while (++index < length) {
                            codePoint = codePoints[index];
                            byteString += encodeCodePoint(codePoint);
                        }
                        return byteString;
                    }

                    /*--------------------------------------------------------------------------*/

                    function readContinuationByte() {
                        if (byteIndex >= byteCount) {
                            throw Error('Invalid byte index');
                        }

                        var continuationByte = byteArray[byteIndex] & 0xFF;
                        byteIndex++;

                        if ((continuationByte & 0xC0) == 0x80) {
                            return continuationByte & 0x3F;
                        }

                        // If we end up here, it’s not a continuation byte
                        throw Error('Invalid continuation byte');
                    }

                    function decodeSymbol() {
                        var byte1;
                        var byte2;
                        var byte3;
                        var byte4;
                        var codePoint;

                        if (byteIndex > byteCount) {
                            throw Error('Invalid byte index');
                        }

                        if (byteIndex == byteCount) {
                            return false;
                        }

                        // Read first byte
                        byte1 = byteArray[byteIndex] & 0xFF;
                        byteIndex++;

                        // 1-byte sequence (no continuation bytes)
                        if ((byte1 & 0x80) == 0) {
                            return byte1;
                        }

                        // 2-byte sequence
                        if ((byte1 & 0xE0) == 0xC0) {
                            var byte2 = readContinuationByte();
                            codePoint = ((byte1 & 0x1F) << 6) | byte2;
                            if (codePoint >= 0x80) {
                                return codePoint;
                            } else {
                                throw Error('Invalid continuation byte');
                            }
                        }

                        // 3-byte sequence (may include unpaired surrogates)
                        if ((byte1 & 0xF0) == 0xE0) {
                            byte2 = readContinuationByte();
                            byte3 = readContinuationByte();
                            codePoint = ((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3;
                            if (codePoint >= 0x0800) {
                                return codePoint;
                            } else {
                                throw Error('Invalid continuation byte');
                            }
                        }

                        // 4-byte sequence
                        if ((byte1 & 0xF8) == 0xF0) {
                            byte2 = readContinuationByte();
                            byte3 = readContinuationByte();
                            byte4 = readContinuationByte();
                            codePoint = ((byte1 & 0x0F) << 0x12) | (byte2 << 0x0C) |
                                (byte3 << 0x06) | byte4;
                            if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
                                return codePoint;
                            }
                        }

                        throw Error('Invalid UTF-8 detected');
                    }

                    var byteArray;
                    var byteCount;
                    var byteIndex;
                    function utf8decode(byteString) {
                        byteArray = ucs2decode(byteString);
                        byteCount = byteArray.length;
                        byteIndex = 0;
                        var codePoints = [];
                        var tmp;
                        while ((tmp = decodeSymbol()) !== false) {
                            codePoints.push(tmp);
                        }
                        return ucs2encode(codePoints);
                    }

                    /*--------------------------------------------------------------------------*/

                    var utf8 = {
                        'version': '2.0.0',
                        'encode': utf8encode,
                        'decode': utf8decode
                    };

                    // Some AMD build optimizers, like r.js, check for specific condition patterns
                    // like the following:
                    if (
                        typeof define == 'function' &&
                        typeof define.amd == 'object' &&
                        define.amd
                    ) {
                        define(function () {
                            return utf8;
                        });
                    } else if (freeExports && !freeExports.nodeType) {
                        if (freeModule) { // in Node.js or RingoJS v0.8.0+
                            freeModule.exports = utf8;
                        } else { // in Narwhal or RingoJS v0.7.0-
                            var object = {};
                            var hasOwnProperty = object.hasOwnProperty;
                            for (var key in utf8) {
                                hasOwnProperty.call(utf8, key) && (freeExports[key] = utf8[key]);
                            }
                        }
                    } else { // in Rhino or a web browser
                        root.utf8 = utf8;
                    }

                }(this));

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}], 34: [function (_dereq_, module, exports) {
            (function (global) {
                /**
                 * JSON parse.
                 *
                 * @see Based on jQuery#parseJSON (MIT) and JSON2
                 * @api private
                 */

                var rvalidchars = /^[\],:{}\s]*$/;
                var rvalidescape = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
                var rvalidtokens = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
                var rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g;
                var rtrimLeft = /^\s+/;
                var rtrimRight = /\s+$/;

                module.exports = function parsejson(data) {
                    if ('string' != typeof data || !data) {
                        return null;
                    }

                    data = data.replace(rtrimLeft, '').replace(rtrimRight, '');

                    // Attempt to parse using the native JSON parser first
                    if (global.JSON && JSON.parse) {
                        return JSON.parse(data);
                    }

                    if (rvalidchars.test(data.replace(rvalidescape, '@')
                        .replace(rvalidtokens, ']')
                        .replace(rvalidbraces, ''))) {
                        return (new Function('return ' + data))();
                    }
                };
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}], 35: [function (_dereq_, module, exports) {
            /**
             * Compiles a querystring
             * Returns string representation of the object
             *
             * @param {Object}
             * @api private
             */

            exports.encode = function (obj) {
                var str = '';

                for (var i in obj) {
                    if (obj.hasOwnProperty(i)) {
                        if (str.length) str += '&';
                        str += encodeURIComponent(i) + '=' + encodeURIComponent(obj[i]);
                    }
                }

                return str;
            };

            /**
             * Parses a simple querystring into an object
             *
             * @param {String} qs
             * @api private
             */

            exports.decode = function (qs) {
                var qry = {};
                var pairs = qs.split('&');
                for (var i = 0, l = pairs.length; i < l; i++) {
                    var pair = pairs[i].split('=');
                    qry[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
                }
                return qry;
            };

        }, {}], 36: [function (_dereq_, module, exports) {
            /**
             * Parses an URI
             *
             * @author Steven Levithan <stevenlevithan.com> (MIT license)
             * @api private
             */

            var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

            var parts = [
                'source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'
            ];

            module.exports = function parseuri(str) {
                var src = str,
                    b = str.indexOf('['),
                    e = str.indexOf(']');

                if (b != -1 && e != -1) {
                    str = str.substring(0, b) + str.substring(b, e).replace(/:/g, ';') + str.substring(e, str.length);
                }

                var m = re.exec(str || ''),
                    uri = {},
                    i = 14;

                while (i--) {
                    uri[parts[i]] = m[i] || '';
                }

                if (b != -1 && e != -1) {
                    uri.source = src;
                    uri.host = uri.host.substring(1, uri.host.length - 1).replace(/;/g, ':');
                    uri.authority = uri.authority.replace('[', '').replace(']', '').replace(/;/g, ':');
                    uri.ipv6uri = true;
                }

                return uri;
            };

        }, {}], 37: [function (_dereq_, module, exports) {

            /**
             * Module dependencies.
             */

            var global = (function () { return this; })();

            /**
             * WebSocket constructor.
             */

            var WebSocket = global.WebSocket || global.MozWebSocket;

            /**
             * Module exports.
             */

            module.exports = WebSocket ? ws : null;

            /**
             * WebSocket constructor.
             *
             * The third `opts` options object gets ignored in web browsers, since it's
             * non-standard, and throws a TypeError if passed to the constructor.
             * See: https://github.com/einaros/ws/issues/227
             *
             * @param {String} uri
             * @param {Array} protocols (optional)
             * @param {Object) opts (optional)
             * @api public
             */

            function ws(uri, protocols, opts) {
                var instance;
                if (protocols) {
                    instance = new WebSocket(uri, protocols);
                } else {
                    instance = new WebSocket(uri);
                }
                return instance;
            }

            if (WebSocket) ws.prototype = WebSocket.prototype;

        }, {}], 38: [function (_dereq_, module, exports) {
            (function (global) {

                /*
                 * Module requirements.
                 */

                var isArray = _dereq_('isarray');

                /**
                 * Module exports.
                 */

                module.exports = hasBinary;

                /**
                 * Checks for binary data.
                 *
                 * Right now only Buffer and ArrayBuffer are supported..
                 *
                 * @param {Object} anything
                 * @api public
                 */

                function hasBinary(data) {

                    function _hasBinary(obj) {
                        if (!obj) return false;

                        if ((global.Buffer && global.Buffer.isBuffer(obj)) ||
                             (global.ArrayBuffer && obj instanceof ArrayBuffer) ||
                             (global.Blob && obj instanceof Blob) ||
                             (global.File && obj instanceof File)
                            ) {
                            return true;
                        }

                        if (isArray(obj)) {
                            for (var i = 0; i < obj.length; i++) {
                                if (_hasBinary(obj[i])) {
                                    return true;
                                }
                            }
                        } else if (obj && 'object' == typeof obj) {
                            if (obj.toJSON) {
                                obj = obj.toJSON();
                            }

                            for (var key in obj) {
                                if (Object.prototype.hasOwnProperty.call(obj, key) && _hasBinary(obj[key])) {
                                    return true;
                                }
                            }
                        }

                        return false;
                    }

                    return _hasBinary(data);
                }

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "isarray": 39 }], 39: [function (_dereq_, module, exports) {
            module.exports = _dereq_(32)
        }, {}], 40: [function (_dereq_, module, exports) {

            /**
             * Module dependencies.
             */

            var global = _dereq_('global');

            /**
             * Module exports.
             *
             * Logic borrowed from Modernizr:
             *
             *   - https://github.com/Modernizr/Modernizr/blob/master/feature-detects/cors.js
             */

            try {
                module.exports = 'XMLHttpRequest' in global &&
                  'withCredentials' in new global.XMLHttpRequest();
            } catch (err) {
                // if XMLHttp support is disabled in IE then it will throw
                // when trying to create
                module.exports = false;
            }

        }, { "global": 41 }], 41: [function (_dereq_, module, exports) {

            /**
             * Returns `this`. Execute this without a "context" (i.e. without it being
             * attached to an object of the left-hand side), and `this` points to the
             * "global" scope of the current JS execution.
             */

            module.exports = (function () { return this; })();

        }, {}], 42: [function (_dereq_, module, exports) {

            var indexOf = [].indexOf;

            module.exports = function (arr, obj) {
                if (indexOf) return arr.indexOf(obj);
                for (var i = 0; i < arr.length; ++i) {
                    if (arr[i] === obj) return i;
                }
                return -1;
            };
        }, {}], 43: [function (_dereq_, module, exports) {

            /**
             * HOP ref.
             */

            var has = Object.prototype.hasOwnProperty;

            /**
             * Return own keys in `obj`.
             *
             * @param {Object} obj
             * @return {Array}
             * @api public
             */

            exports.keys = Object.keys || function (obj) {
                var keys = [];
                for (var key in obj) {
                    if (has.call(obj, key)) {
                        keys.push(key);
                    }
                }
                return keys;
            };

            /**
             * Return own values in `obj`.
             *
             * @param {Object} obj
             * @return {Array}
             * @api public
             */

            exports.values = function (obj) {
                var vals = [];
                for (var key in obj) {
                    if (has.call(obj, key)) {
                        vals.push(obj[key]);
                    }
                }
                return vals;
            };

            /**
             * Merge `b` into `a`.
             *
             * @param {Object} a
             * @param {Object} b
             * @return {Object} a
             * @api public
             */

            exports.merge = function (a, b) {
                for (var key in b) {
                    if (has.call(b, key)) {
                        a[key] = b[key];
                    }
                }
                return a;
            };

            /**
             * Return length of `obj`.
             *
             * @param {Object} obj
             * @return {Number}
             * @api public
             */

            exports.length = function (obj) {
                return exports.keys(obj).length;
            };

            /**
             * Check if `obj` is empty.
             *
             * @param {Object} obj
             * @return {Boolean}
             * @api public
             */

            exports.isEmpty = function (obj) {
                return 0 == exports.length(obj);
            };
        }, {}], 44: [function (_dereq_, module, exports) {
            /**
             * Parses an URI
             *
             * @author Steven Levithan <stevenlevithan.com> (MIT license)
             * @api private
             */

            var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

            var parts = [
                'source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host'
              , 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'
            ];

            module.exports = function parseuri(str) {
                var m = re.exec(str || '')
                  , uri = {}
                  , i = 14;

                while (i--) {
                    uri[parts[i]] = m[i] || '';
                }

                return uri;
            };

        }, {}], 45: [function (_dereq_, module, exports) {
            (function (global) {
                /*global Blob,File*/

                /**
                 * Module requirements
                 */

                var isArray = _dereq_('isarray');
                var isBuf = _dereq_('./is-buffer');

                /**
                 * Replaces every Buffer | ArrayBuffer in packet with a numbered placeholder.
                 * Anything with blobs or files should be fed through removeBlobs before coming
                 * here.
                 *
                 * @param {Object} packet - socket.io event packet
                 * @return {Object} with deconstructed packet and list of buffers
                 * @api public
                 */

                exports.deconstructPacket = function (packet) {
                    var buffers = [];
                    var packetData = packet.data;

                    function _deconstructPacket(data) {
                        if (!data) return data;

                        if (isBuf(data)) {
                            var placeholder = { _placeholder: true, num: buffers.length };
                            buffers.push(data);
                            return placeholder;
                        } else if (isArray(data)) {
                            var newData = new Array(data.length);
                            for (var i = 0; i < data.length; i++) {
                                newData[i] = _deconstructPacket(data[i]);
                            }
                            return newData;
                        } else if ('object' == typeof data && !(data instanceof Date)) {
                            var newData = {};
                            for (var key in data) {
                                newData[key] = _deconstructPacket(data[key]);
                            }
                            return newData;
                        }
                        return data;
                    }

                    var pack = packet;
                    pack.data = _deconstructPacket(packetData);
                    pack.attachments = buffers.length; // number of binary 'attachments'
                    return { packet: pack, buffers: buffers };
                };

                /**
                 * Reconstructs a binary packet from its placeholder packet and buffers
                 *
                 * @param {Object} packet - event packet with placeholders
                 * @param {Array} buffers - binary buffers to put in placeholder positions
                 * @return {Object} reconstructed packet
                 * @api public
                 */

                exports.reconstructPacket = function (packet, buffers) {
                    var curPlaceHolder = 0;

                    function _reconstructPacket(data) {
                        if (data && data._placeholder) {
                            var buf = buffers[data.num]; // appropriate buffer (should be natural order anyway)
                            return buf;
                        } else if (isArray(data)) {
                            for (var i = 0; i < data.length; i++) {
                                data[i] = _reconstructPacket(data[i]);
                            }
                            return data;
                        } else if (data && 'object' == typeof data) {
                            for (var key in data) {
                                data[key] = _reconstructPacket(data[key]);
                            }
                            return data;
                        }
                        return data;
                    }

                    packet.data = _reconstructPacket(packet.data);
                    packet.attachments = undefined; // no longer useful
                    return packet;
                };

                /**
                 * Asynchronously removes Blobs or Files from data via
                 * FileReader's readAsArrayBuffer method. Used before encoding
                 * data as msgpack. Calls Callback with the blobless data.
                 *
                 * @param {Object} data
                 * @param {Function} Callback
                 * @api private
                 */

                exports.removeBlobs = function (data, Callback) {
                    function _removeBlobs(obj, curKey, containingObject) {
                        if (!obj) return obj;

                        // convert any blob
                        if ((global.Blob && obj instanceof Blob) ||
                            (global.File && obj instanceof File)) {
                            pendingBlobs++;

                            // async filereader
                            var fileReader = new FileReader();
                            fileReader.onload = function () { // this.result == arraybuffer
                                if (containingObject) {
                                    containingObject[curKey] = this.result;
                                }
                                else {
                                    bloblessData = this.result;
                                }

                                // if nothing pending its Callback time
                                if (! --pendingBlobs) {
                                    Callback(bloblessData);
                                }
                            };

                            fileReader.readAsArrayBuffer(obj); // blob -> arraybuffer
                        } else if (isArray(obj)) { // handle array
                            for (var i = 0; i < obj.length; i++) {
                                _removeBlobs(obj[i], i, obj);
                            }
                        } else if (obj && 'object' == typeof obj && !isBuf(obj)) { // and object
                            for (var key in obj) {
                                _removeBlobs(obj[key], key, obj);
                            }
                        }
                    }

                    var pendingBlobs = 0;
                    var bloblessData = data;
                    _removeBlobs(bloblessData);
                    if (!pendingBlobs) {
                        Callback(bloblessData);
                    }
                };

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, { "./is-buffer": 47, "isarray": 48 }], 46: [function (_dereq_, module, exports) {

            /**
             * Module dependencies.
             */

            var debug = _dereq_('debug')('socket.io-parser');
            var json = _dereq_('json3');
            var isArray = _dereq_('isarray');
            var Emitter = _dereq_('component-emitter');
            var binary = _dereq_('./binary');
            var isBuf = _dereq_('./is-buffer');

            /**
             * Protocol version.
             *
             * @api public
             */

            exports.protocol = 4;

            /**
             * Packet types.
             *
             * @api public
             */

            exports.types = [
              'CONNECT',
              'DISCONNECT',
              'EVENT',
              'BINARY_EVENT',
              'ACK',
              'BINARY_ACK',
              'ERROR'
            ];

            /**
             * Packet type `connect`.
             *
             * @api public
             */

            exports.CONNECT = 0;

            /**
             * Packet type `disconnect`.
             *
             * @api public
             */

            exports.DISCONNECT = 1;

            /**
             * Packet type `event`.
             *
             * @api public
             */

            exports.EVENT = 2;

            /**
             * Packet type `ack`.
             *
             * @api public
             */

            exports.ACK = 3;

            /**
             * Packet type `error`.
             *
             * @api public
             */

            exports.ERROR = 4;

            /**
             * Packet type 'binary event'
             *
             * @api public
             */

            exports.BINARY_EVENT = 5;

            /**
             * Packet type `binary ack`. For acks with binary arguments.
             *
             * @api public
             */

            exports.BINARY_ACK = 6;

            /**
             * Encoder constructor.
             *
             * @api public
             */

            exports.Encoder = Encoder;

            /**
             * Decoder constructor.
             *
             * @api public
             */

            exports.Decoder = Decoder;

            /**
             * A socket.io Encoder instance
             *
             * @api public
             */

            function Encoder() { }

            /**
             * Encode a packet as a single string if non-binary, or as a
             * buffer sequence, depending on packet type.
             *
             * @param {Object} obj - packet object
             * @param {Function} Callback - function to handle encodings (likely engine.write)
             * @return Calls Callback with Array of encodings
             * @api public
             */

            Encoder.prototype.encode = function (obj, Callback) {
                debug('encoding packet %j', obj);

                if (exports.BINARY_EVENT == obj.type || exports.BINARY_ACK == obj.type) {
                    encodeAsBinary(obj, Callback);
                }
                else {
                    var encoding = encodeAsString(obj);
                    Callback([encoding]);
                }
            };

            /**
             * Encode packet as string.
             *
             * @param {Object} packet
             * @return {String} encoded
             * @api private
             */

            function encodeAsString(obj) {
                var str = '';
                var nsp = false;

                // first is type
                str += obj.type;

                // attachments if we have them
                if (exports.BINARY_EVENT == obj.type || exports.BINARY_ACK == obj.type) {
                    str += obj.attachments;
                    str += '-';
                }

                // if we have a namespace other than `/`
                // we append it followed by a comma `,`
                if (obj.nsp && '/' != obj.nsp) {
                    nsp = true;
                    str += obj.nsp;
                }

                // immediately followed by the id
                if (null != obj.id) {
                    if (nsp) {
                        str += ',';
                        nsp = false;
                    }
                    str += obj.id;
                }

                // json data
                if (null != obj.data) {
                    if (nsp) str += ',';
                    str += json.stringify(obj.data);
                }

                debug('encoded %j as %s', obj, str);
                return str;
            }

            /**
             * Encode packet as 'buffer sequence' by removing blobs, and
             * deconstructing packet into object with placeholders and
             * a list of buffers.
             *
             * @param {Object} packet
             * @return {Buffer} encoded
             * @api private
             */

            function encodeAsBinary(obj, Callback) {

                function writeEncoding(bloblessData) {
                    var deconstruction = binary.deconstructPacket(bloblessData);
                    var pack = encodeAsString(deconstruction.packet);
                    var buffers = deconstruction.buffers;

                    buffers.unshift(pack); // add packet info to beginning of data list
                    Callback(buffers); // write all the buffers
                }

                binary.removeBlobs(obj, writeEncoding);
            }

            /**
             * A socket.io Decoder instance
             *
             * @return {Object} decoder
             * @api public
             */

            function Decoder() {
                this.reconstructor = null;
            }

            /**
             * Mix in `Emitter` with Decoder.
             */

            Emitter(Decoder.prototype);

            /**
             * Decodes an ecoded packet string into packet JSON.
             *
             * @param {String} obj - encoded packet
             * @return {Object} packet
             * @api public
             */

            Decoder.prototype.add = function (obj) {
                var packet;
                if ('string' == typeof obj) {
                    packet = decodeString(obj);
                    if (exports.BINARY_EVENT == packet.type || exports.BINARY_ACK == packet.type) { // binary packet's json
                        this.reconstructor = new BinaryReconstructor(packet);

                        // no attachments, labeled binary but no binary data to follow
                        if (this.reconstructor.reconPack.attachments === 0) {
                            this.emit('decoded', packet);
                        }
                    } else { // non-binary full packet
                        this.emit('decoded', packet);
                    }
                }
                else if (isBuf(obj) || obj.base64) { // raw binary data
                    if (!this.reconstructor) {
                        throw new Error('got binary data when not reconstructing a packet');
                    } else {
                        packet = this.reconstructor.takeBinaryData(obj);
                        if (packet) { // received final buffer
                            this.reconstructor = null;
                            this.emit('decoded', packet);
                        }
                    }
                }
                else {
                    throw new Error('Unknown type: ' + obj);
                }
            };

            /**
             * Decode a packet String (JSON data)
             *
             * @param {String} str
             * @return {Object} packet
             * @api private
             */

            function decodeString(str) {
                var p = {};
                var i = 0;

                // look up type
                p.type = Number(str.charAt(0));
                if (null == exports.types[p.type]) return error();

                // look up attachments if type binary
                if (exports.BINARY_EVENT == p.type || exports.BINARY_ACK == p.type) {
                    var buf = '';
                    while (str.charAt(++i) != '-') {
                        buf += str.charAt(i);
                        if (i == str.length) break;
                    }
                    if (buf != Number(buf) || str.charAt(i) != '-') {
                        throw new Error('Illegal attachments');
                    }
                    p.attachments = Number(buf);
                }

                // look up namespace (if any)
                if ('/' == str.charAt(i + 1)) {
                    p.nsp = '';
                    while (++i) {
                        var c = str.charAt(i);
                        if (',' == c) break;
                        p.nsp += c;
                        if (i == str.length) break;
                    }
                } else {
                    p.nsp = '/';
                }

                // look up id
                var next = str.charAt(i + 1);
                if ('' !== next && Number(next) == next) {
                    p.id = '';
                    while (++i) {
                        var c = str.charAt(i);
                        if (null == c || Number(c) != c) {
                            --i;
                            break;
                        }
                        p.id += str.charAt(i);
                        if (i == str.length) break;
                    }
                    p.id = Number(p.id);
                }

                // look up json data
                if (str.charAt(++i)) {
                    try {
                        p.data = json.parse(str.substr(i));
                    } catch (e) {
                        return error();
                    }
                }

                debug('decoded %s as %j', str, p);
                return p;
            }

            /**
             * Deallocates a parser's resources
             *
             * @api public
             */

            Decoder.prototype.destroy = function () {
                if (this.reconstructor) {
                    this.reconstructor.finishedReconstruction();
                }
            };

            /**
             * A manager of a binary event's 'buffer sequence'. Should
             * be constructed whenever a packet of type BINARY_EVENT is
             * decoded.
             *
             * @param {Object} packet
             * @return {BinaryReconstructor} initialized reconstructor
             * @api private
             */

            function BinaryReconstructor(packet) {
                this.reconPack = packet;
                this.buffers = [];
            }

            /**
             * Method to be called when binary data received from connection
             * after a BINARY_EVENT packet.
             *
             * @param {Buffer | ArrayBuffer} binData - the raw binary data received
             * @return {null | Object} returns null if more binary data is expected or
             *   a reconstructed packet object if all buffers have been received.
             * @api private
             */

            BinaryReconstructor.prototype.takeBinaryData = function (binData) {
                this.buffers.push(binData);
                if (this.buffers.length == this.reconPack.attachments) { // done with buffer list
                    var packet = binary.reconstructPacket(this.reconPack, this.buffers);
                    this.finishedReconstruction();
                    return packet;
                }
                return null;
            };

            /**
             * Cleans up binary packet reconstruction variables.
             *
             * @api private
             */

            BinaryReconstructor.prototype.finishedReconstruction = function () {
                this.reconPack = null;
                this.buffers = [];
            };

            function error(data) {
                return {
                    type: exports.ERROR,
                    data: 'parser error'
                };
            }

        }, { "./binary": 45, "./is-buffer": 47, "component-emitter": 9, "debug": 10, "isarray": 48, "json3": 49 }], 47: [function (_dereq_, module, exports) {
            (function (global) {

                module.exports = isBuf;

                /**
                 * Returns true if obj is a buffer or an arraybuffer.
                 *
                 * @api private
                 */

                function isBuf(obj) {
                    return (global.Buffer && global.Buffer.isBuffer(obj)) ||
                           (global.ArrayBuffer && obj instanceof ArrayBuffer);
                }

            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}], 48: [function (_dereq_, module, exports) {
            module.exports = _dereq_(32)
        }, {}], 49: [function (_dereq_, module, exports) {
            /*! JSON v3.2.6 | http://bestiejs.github.io/json3 | Copyright 2012-2013, Kit Cambridge | http://kit.mit-license.org */
            ; (function (window) {
                // Convenience aliases.
                var getClass = {}.toString, isProperty, forEach, undef;

                // Detect the `define` function exposed by asynchronous module loaders. The
                // strict `define` check is necessary for compatibility with `r.js`.
                var isLoader = typeof define === "function" && define.amd;

                // Detect native implementations.
                var nativeJSON = typeof JSON == "object" && JSON;

                // Set up the JSON 3 namespace, preferring the CommonJS `exports` object if
                // available.
                var JSON3 = typeof exports == "object" && exports && !exports.nodeType && exports;

                if (JSON3 && nativeJSON) {
                    // Explicitly delegate to the native `stringify` and `parse`
                    // implementations in CommonJS environments.
                    JSON3.stringify = nativeJSON.stringify;
                    JSON3.parse = nativeJSON.parse;
                } else {
                    // Export for web browsers, JavaScript engines, and asynchronous module
                    // loaders, using the global `JSON` object if available.
                    JSON3 = window.JSON = nativeJSON || {};
                }

                // Test the `Date#getUTC*` methods. Based on work by @Yaffle.
                var isExtended = new Date(-3509827334573292);
                try {
                    // The `getUTCFullYear`, `Month`, and `Date` methods return nonsensical
                    // results for certain dates in Opera >= 10.53.
                    isExtended = isExtended.getUTCFullYear() == -109252 && isExtended.getUTCMonth() === 0 && isExtended.getUTCDate() === 1 &&
                      // Safari < 2.0.2 stores the internal millisecond time value correctly,
                      // but clips the values returned by the date methods to the range of
                      // signed 32-bit integers ([-2 ** 31, 2 ** 31 - 1]).
                      isExtended.getUTCHours() == 10 && isExtended.getUTCMinutes() == 37 && isExtended.getUTCSeconds() == 6 && isExtended.getUTCMilliseconds() == 708;
                } catch (exception) { }

                // Internal: Determines whether the native `JSON.stringify` and `parse`
                // implementations are spec-compliant. Based on work by Ken Snyder.
                function has(name) {
                    if (has[name] !== undef) {
                        // Return cached feature test result.
                        return has[name];
                    }

                    var isSupported;
                    if (name == "bug-string-char-index") {
                        // IE <= 7 doesn't support accessing string characters using square
                        // bracket notation. IE 8 only supports this for primitives.
                        isSupported = "a"[0] != "a";
                    } else if (name == "json") {
                        // Indicates whether both `JSON.stringify` and `JSON.parse` are
                        // supported.
                        isSupported = has("json-stringify") && has("json-parse");
                    } else {
                        var value, serialized = '{"a":[1,true,false,null,"\\u0000\\b\\n\\f\\r\\t"]}';
                        // Test `JSON.stringify`.
                        if (name == "json-stringify") {
                            var stringify = JSON3.stringify, stringifySupported = typeof stringify == "function" && isExtended;
                            if (stringifySupported) {
                                // A test function object with a custom `toJSON` method.
                                (value = function () {
                                    return 1;
                                }).toJSON = value;
                                try {
                                    stringifySupported =
                                      // Firefox 3.1b1 and b2 serialize string, number, and boolean
                                      // primitives as object literals.
                                      stringify(0) === "0" &&
                                      // FF 3.1b1, b2, and JSON 2 serialize wrapped primitives as object
                                      // literals.
                                      stringify(new Number()) === "0" &&
                                      stringify(new String()) == '""' &&
                                      // FF 3.1b1, 2 throw an error if the value is `null`, `undefined`, or
                                      // does not define a canonical JSON representation (this applies to
                                      // objects with `toJSON` properties as well, *unless* they are nested
                                      // within an object or array).
                                      stringify(getClass) === undef &&
                                      // IE 8 serializes `undefined` as `"undefined"`. Safari <= 5.1.7 and
                                      // FF 3.1b3 pass this test.
                                      stringify(undef) === undef &&
                                      // Safari <= 5.1.7 and FF 3.1b3 throw `Error`s and `TypeError`s,
                                      // respectively, if the value is omitted entirely.
                                      stringify() === undef &&
                                      // FF 3.1b1, 2 throw an error if the given value is not a number,
                                      // string, array, object, Boolean, or `null` literal. This applies to
                                      // objects with custom `toJSON` methods as well, unless they are nested
                                      // inside object or array literals. YUI 3.0.0b1 ignores custom `toJSON`
                                      // methods entirely.
                                      stringify(value) === "1" &&
                                      stringify([value]) == "[1]" &&
                                      // Prototype <= 1.6.1 serializes `[undefined]` as `"[]"` instead of
                                      // `"[null]"`.
                                      stringify([undef]) == "[null]" &&
                                      // YUI 3.0.0b1 fails to serialize `null` literals.
                                      stringify(null) == "null" &&
                                      // FF 3.1b1, 2 halts serialization if an array contains a function:
                                      // `[1, true, getClass, 1]` serializes as "[1,true,],". FF 3.1b3
                                      // elides non-JSON values from objects and arrays, unless they
                                      // define custom `toJSON` methods.
                                      stringify([undef, getClass, null]) == "[null,null,null]" &&
                                      // Simple serialization test. FF 3.1b1 uses Unicode escape sequences
                                      // where character escape codes are expected (e.g., `\b` => `\u0008`).
                                      stringify({ "a": [value, true, false, null, "\x00\b\n\f\r\t"] }) == serialized &&
                                      // FF 3.1b1 and b2 ignore the `filter` and `width` arguments.
                                      stringify(null, value) === "1" &&
                                      stringify([1, 2], null, 1) == "[\n 1,\n 2\n]" &&
                                      // JSON 2, Prototype <= 1.7, and older WebKit builds incorrectly
                                      // serialize extended years.
                                      stringify(new Date(-8.64e15)) == '"-271821-04-20T00:00:00.000Z"' &&
                                      // The milliseconds are optional in ES 5, but required in 5.1.
                                      stringify(new Date(8.64e15)) == '"+275760-09-13T00:00:00.000Z"' &&
                                      // Firefox <= 11.0 incorrectly serializes years prior to 0 as negative
                                      // four-digit years instead of six-digit years. Credits: @Yaffle.
                                      stringify(new Date(-621987552e5)) == '"-000001-01-01T00:00:00.000Z"' &&
                                      // Safari <= 5.1.5 and Opera >= 10.53 incorrectly serialize millisecond
                                      // values less than 1000. Credits: @Yaffle.
                                      stringify(new Date(-1)) == '"1969-12-31T23:59:59.999Z"';
                                } catch (exception) {
                                    stringifySupported = false;
                                }
                            }
                            isSupported = stringifySupported;
                        }
                        // Test `JSON.parse`.
                        if (name == "json-parse") {
                            var parse = JSON3.parse;
                            if (typeof parse == "function") {
                                try {
                                    // FF 3.1b1, b2 will throw an exception if a bare literal is provided.
                                    // Conforming implementations should also coerce the initial argument to
                                    // a string prior to parsing.
                                    if (parse("0") === 0 && !parse(false)) {
                                        // Simple parsing test.
                                        value = parse(serialized);
                                        var parseSupported = value["a"].length == 5 && value["a"][0] === 1;
                                        if (parseSupported) {
                                            try {
                                                // Safari <= 5.1.2 and FF 3.1b1 allow unescaped tabs in strings.
                                                parseSupported = !parse('"\t"');
                                            } catch (exception) { }
                                            if (parseSupported) {
                                                try {
                                                    // FF 4.0 and 4.0.1 allow leading `+` signs and leading
                                                    // decimal points. FF 4.0, 4.0.1, and IE 9-10 also allow
                                                    // certain octal literals.
                                                    parseSupported = parse("01") !== 1;
                                                } catch (exception) { }
                                            }
                                            if (parseSupported) {
                                                try {
                                                    // FF 4.0, 4.0.1, and Rhino 1.7R3-R4 allow trailing decimal
                                                    // points. These environments, along with FF 3.1b1 and 2,
                                                    // also allow trailing commas in JSON objects and arrays.
                                                    parseSupported = parse("1.") !== 1;
                                                } catch (exception) { }
                                            }
                                        }
                                    }
                                } catch (exception) {
                                    parseSupported = false;
                                }
                            }
                            isSupported = parseSupported;
                        }
                    }
                    return has[name] = !!isSupported;
                }

                if (!has("json")) {
                    // Common `[[Class]]` name aliases.
                    var functionClass = "[object Function]";
                    var dateClass = "[object Date]";
                    var numberClass = "[object Number]";
                    var stringClass = "[object String]";
                    var arrayClass = "[object Array]";
                    var booleanClass = "[object Boolean]";

                    // Detect incomplete support for accessing string characters by index.
                    var charIndexBuggy = has("bug-string-char-index");

                    // Define additional utility methods if the `Date` methods are buggy.
                    if (!isExtended) {
                        var floor = Math.floor;
                        // A mapping between the months of the year and the number of days between
                        // January 1st and the first of the respective month.
                        var Months = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
                        // Internal: Calculates the number of days between the Unix epoch and the
                        // first day of the given month.
                        var getDay = function (year, month) {
                            return Months[month] + 365 * (year - 1970) + floor((year - 1969 + (month = +(month > 1))) / 4) - floor((year - 1901 + month) / 100) + floor((year - 1601 + month) / 400);
                        };
                    }

                    // Internal: Determines if a property is a direct property of the given
                    // object. Delegates to the native `Object#hasOwnProperty` method.
                    if (!(isProperty = {}.hasOwnProperty)) {
                        isProperty = function (property) {
                            var members = {}, constructor;
                            if ((members.__proto__ = null, members.__proto__ = {
                                // The *proto* property cannot be set multiple times in recent
                                // versions of Firefox and SeaMonkey.
                              "toString": 1
                            }, members).toString != getClass) {
                                // Safari <= 2.0.3 doesn't implement `Object#hasOwnProperty`, but
                                // supports the mutable *proto* property.
                                isProperty = function (property) {
                                    // Capture and break the object's prototype chain (see section 8.6.2
                                    // of the ES 5.1 spec). The parenthesized expression prevents an
                                    // unsafe transformation by the Closure Compiler.
                                    var original = this.__proto__, result = property in (this.__proto__ = null, this);
                                    // Restore the original prototype chain.
                                    this.__proto__ = original;
                                    return result;
                                };
                            } else {
                                // Capture a reference to the top-level `Object` constructor.
                                constructor = members.constructor;
                                // Use the `constructor` property to simulate `Object#hasOwnProperty` in
                                // other environments.
                                isProperty = function (property) {
                                    var parent = (this.constructor || constructor).prototype;
                                    return property in this && !(property in parent && this[property] === parent[property]);
                                };
                            }
                            members = null;
                            return isProperty.call(this, property);
                        };
                    }

                    // Internal: A set of primitive types used by `isHostType`.
                    var PrimitiveTypes = {
                        'boolean': 1,
                        'number': 1,
                        'string': 1,
                        'undefined': 1
                    };

                    // Internal: Determines if the given object `property` value is a
                    // non-primitive.
                    var isHostType = function (object, property) {
                        var type = typeof object[property];
                        return type == 'object' ? !!object[property] : !PrimitiveTypes[type];
                    };

                    // Internal: Normalizes the `for...in` iteration algorithm across
                    // environments. Each enumerated key is yielded to a `Callback` function.
                    forEach = function (object, Callback) {
                        var size = 0, Properties, members, property;

                        // Tests for bugs in the current environment's `for...in` algorithm. The
                        // `valueOf` property inherits the non-enumerable flag from
                        // `Object.prototype` in older versions of IE, Netscape, and Mozilla.
                        (Properties = function () {
                            this.valueOf = 0;
                        }).prototype.valueOf = 0;

                        // Iterate over a new instance of the `Properties` class.
                        members = new Properties();
                        for (property in members) {
                            // Ignore all properties inherited from `Object.prototype`.
                            if (isProperty.call(members, property)) {
                                size++;
                            }
                        }
                        Properties = members = null;

                        // Normalize the iteration algorithm.
                        if (!size) {
                            // A list of non-enumerable properties inherited from `Object.prototype`.
                            members = ["valueOf", "toString", "toLocaleString", "propertyIsEnumerable", "isPrototypeOf", "hasOwnProperty", "constructor"];
                            // IE <= 8, Mozilla 1.0, and Netscape 6.2 ignore shadowed non-enumerable
                            // properties.
                            forEach = function (object, Callback) {
                                var isFunction = getClass.call(object) == functionClass, property, length;
                                var hasProperty = !isFunction && typeof object.constructor != 'function' && isHostType(object, 'hasOwnProperty') ? object.hasOwnProperty : isProperty;
                                for (property in object) {
                                    // Gecko <= 1.0 enumerates the `prototype` property of functions under
                                    // certain conditions; IE does not.
                                    if (!(isFunction && property == "prototype") && hasProperty.call(object, property)) {
                                        Callback(property);
                                    }
                                }
                                // Manually invoke the Callback for each non-enumerable property.
                                for (length = members.length; property = members[--length]; hasProperty.call(object, property) && Callback(property));
                            };
                        } else if (size == 2) {
                            // Safari <= 2.0.4 enumerates shadowed properties twice.
                            forEach = function (object, Callback) {
                                // Create a set of iterated properties.
                                var members = {}, isFunction = getClass.call(object) == functionClass, property;
                                for (property in object) {
                                    // Store each property name to prevent double enumeration. The
                                    // `prototype` property of functions is not enumerated due to cross-
                                    // environment inconsistencies.
                                    if (!(isFunction && property == "prototype") && !isProperty.call(members, property) && (members[property] = 1) && isProperty.call(object, property)) {
                                        Callback(property);
                                    }
                                }
                            };
                        } else {
                            // No bugs detected; use the standard `for...in` algorithm.
                            forEach = function (object, Callback) {
                                var isFunction = getClass.call(object) == functionClass, property, isConstructor;
                                for (property in object) {
                                    if (!(isFunction && property == "prototype") && isProperty.call(object, property) && !(isConstructor = property === "constructor")) {
                                        Callback(property);
                                    }
                                }
                                // Manually invoke the Callback for the `constructor` property due to
                                // cross-environment inconsistencies.
                                if (isConstructor || isProperty.call(object, (property = "constructor"))) {
                                    Callback(property);
                                }
                            };
                        }
                        return forEach(object, Callback);
                    };

                    // Public: Serializes a JavaScript `value` as a JSON string. The optional
                    // `filter` argument may specify either a function that alters how object and
                    // array members are serialized, or an array of strings and numbers that
                    // indicates which properties should be serialized. The optional `width`
                    // argument may be either a string or number that specifies the indentation
                    // level of the output.
                    if (!has("json-stringify")) {
                        // Internal: A map of control characters and their escaped equivalents.
                        var Escapes = {
                            92: "\\\\",
                            34: '\\"',
                            8: "\\b",
                            12: "\\f",
                            10: "\\n",
                            13: "\\r",
                            9: "\\t"
                        };

                        // Internal: Converts `value` into a zero-padded string such that its
                        // length is at least equal to `width`. The `width` must be <= 6.
                        var leadingZeroes = "000000";
                        var toPaddedString = function (width, value) {
                            // The `|| 0` expression is necessary to work around a bug in
                            // Opera <= 7.54u2 where `0 == -0`, but `String(-0) !== "0"`.
                            return (leadingZeroes + (value || 0)).slice(-width);
                        };

                        // Internal: Double-quotes a string `value`, replacing all ASCII control
                        // characters (characters with code unit values between 0 and 31) with
                        // their escaped equivalents. This is an implementation of the
                        // `Quote(value)` operation defined in ES 5.1 section 15.12.3.
                        var unicodePrefix = "\\u00";
                        var quote = function (value) {
                            var result = '"', index = 0, length = value.length, isLarge = length > 10 && charIndexBuggy, symbols;
                            if (isLarge) {
                                symbols = value.split("");
                            }
                            for (; index < length; index++) {
                                var charCode = value.charCodeAt(index);
                                // If the character is a control character, append its Unicode or
                                // shorthand escape sequence; otherwise, append the character as-is.
                                switch (charCode) {
                                    case 8: case 9: case 10: case 12: case 13: case 34: case 92:
                                        result += Escapes[charCode];
                                        break;
                                    default:
                                        if (charCode < 32) {
                                            result += unicodePrefix + toPaddedString(2, charCode.toString(16));
                                            break;
                                        }
                                        result += isLarge ? symbols[index] : charIndexBuggy ? value.charAt(index) : value[index];
                                }
                            }
                            return result + '"';
                        };

                        // Internal: Recursively serializes an object. Implements the
                        // `Str(key, holder)`, `JO(value)`, and `JA(value)` operations.
                        var serialize = function (property, object, Callback, properties, whitespace, indentation, stack) {
                            var value, className, year, month, date, time, hours, minutes, seconds, milliseconds, results, element, index, length, prefix, result;
                            try {
                                // Necessary for host object support.
                                value = object[property];
                            } catch (exception) { }
                            if (typeof value == "object" && value) {
                                className = getClass.call(value);
                                if (className == dateClass && !isProperty.call(value, "toJSON")) {
                                    if (value > -1 / 0 && value < 1 / 0) {
                                        // Dates are serialized according to the `Date#toJSON` method
                                        // specified in ES 5.1 section 15.9.5.44. See section 15.9.1.15
                                        // for the ISO 8601 date time string format.
                                        if (getDay) {
                                            // Manually compute the year, month, date, hours, minutes,
                                            // seconds, and milliseconds if the `getUTC*` methods are
                                            // buggy. Adapted from @Yaffle's `date-shim` project.
                                            date = floor(value / 864e5);
                                            for (year = floor(date / 365.2425) + 1970 - 1; getDay(year + 1, 0) <= date; year++);
                                            for (month = floor((date - getDay(year, 0)) / 30.42) ; getDay(year, month + 1) <= date; month++);
                                            date = 1 + date - getDay(year, month);
                                            // The `time` value specifies the time within the day (see ES
                                            // 5.1 section 15.9.1.2). The formula `(A % B + B) % B` is used
                                            // to compute `A modulo B`, as the `%` operator does not
                                            // correspond to the `modulo` operation for negative numbers.
                                            time = (value % 864e5 + 864e5) % 864e5;
                                            // The hours, minutes, seconds, and milliseconds are obtained by
                                            // decomposing the time within the day. See section 15.9.1.10.
                                            hours = floor(time / 36e5) % 24;
                                            minutes = floor(time / 6e4) % 60;
                                            seconds = floor(time / 1e3) % 60;
                                            milliseconds = time % 1e3;
                                        } else {
                                            year = value.getUTCFullYear();
                                            month = value.getUTCMonth();
                                            date = value.getUTCDate();
                                            hours = value.getUTCHours();
                                            minutes = value.getUTCMinutes();
                                            seconds = value.getUTCSeconds();
                                            milliseconds = value.getUTCMilliseconds();
                                        }
                                        // Serialize extended years correctly.
                                        value = (year <= 0 || year >= 1e4 ? (year < 0 ? "-" : "+") + toPaddedString(6, year < 0 ? -year : year) : toPaddedString(4, year)) +
                                          "-" + toPaddedString(2, month + 1) + "-" + toPaddedString(2, date) +
                                          // Months, dates, hours, minutes, and seconds should have two
                                          // digits; milliseconds should have three.
                                          "T" + toPaddedString(2, hours) + ":" + toPaddedString(2, minutes) + ":" + toPaddedString(2, seconds) +
                                          // Milliseconds are optional in ES 5.0, but required in 5.1.
                                          "." + toPaddedString(3, milliseconds) + "Z";
                                    } else {
                                        value = null;
                                    }
                                } else if (typeof value.toJSON == "function" && ((className != numberClass && className != stringClass && className != arrayClass) || isProperty.call(value, "toJSON"))) {
                                    // Prototype <= 1.6.1 adds non-standard `toJSON` methods to the
                                    // `Number`, `String`, `Date`, and `Array` prototypes. JSON 3
                                    // ignores all `toJSON` methods on these objects unless they are
                                    // defined directly on an instance.
                                    value = value.toJSON(property);
                                }
                            }
                            if (Callback) {
                                // If a replacement function was provided, call it to obtain the value
                                // for serialization.
                                value = Callback.call(object, property, value);
                            }
                            if (value === null) {
                                return "null";
                            }
                            className = getClass.call(value);
                            if (className == booleanClass) {
                                // Booleans are represented literally.
                                return "" + value;
                            } else if (className == numberClass) {
                                // JSON numbers must be finite. `Infinity` and `NaN` are serialized as
                                // `"null"`.
                                return value > -1 / 0 && value < 1 / 0 ? "" + value : "null";
                            } else if (className == stringClass) {
                                // Strings are double-quoted and escaped.
                                return quote("" + value);
                            }
                            // Recursively serialize objects and arrays.
                            if (typeof value == "object") {
                                // Check for cyclic structures. This is a linear search; performance
                                // is inversely proportional to the number of unique nested objects.
                                for (length = stack.length; length--;) {
                                    if (stack[length] === value) {
                                        // Cyclic structures cannot be serialized by `JSON.stringify`.
                                        throw TypeError();
                                    }
                                }
                                // Add the object to the stack of traversed objects.
                                stack.push(value);
                                results = [];
                                // Save the current indentation level and indent one additional level.
                                prefix = indentation;
                                indentation += whitespace;
                                if (className == arrayClass) {
                                    // Recursively serialize array elements.
                                    for (index = 0, length = value.length; index < length; index++) {
                                        element = serialize(index, value, Callback, properties, whitespace, indentation, stack);
                                        results.push(element === undef ? "null" : element);
                                    }
                                    result = results.length ? (whitespace ? "[\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "]" : ("[" + results.join(",") + "]")) : "[]";
                                } else {
                                    // Recursively serialize object members. Members are selected from
                                    // either a user-specified list of property names, or the object
                                    // itself.
                                    forEach(properties || value, function (property) {
                                        var element = serialize(property, value, Callback, properties, whitespace, indentation, stack);
                                        if (element !== undef) {
                                            // According to ES 5.1 section 15.12.3: "If `gap` {whitespace}
                                            // is not the empty string, let `member` {quote(property) + ":"}
                                            // be the concatenation of `member` and the `space` character."
                                            // The "`space` character" refers to the literal space
                                            // character, not the `space` {width} argument provided to
                                            // `JSON.stringify`.
                                            results.push(quote(property) + ":" + (whitespace ? " " : "") + element);
                                        }
                                    });
                                    result = results.length ? (whitespace ? "{\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "}" : ("{" + results.join(",") + "}")) : "{}";
                                }
                                // Remove the object from the traversed object stack.
                                stack.pop();
                                return result;
                            }
                        };

                        // Public: `JSON.stringify`. See ES 5.1 section 15.12.3.
                        JSON3.stringify = function (source, filter, width) {
                            var whitespace, Callback, properties, className;
                            if (typeof filter == "function" || typeof filter == "object" && filter) {
                                if ((className = getClass.call(filter)) == functionClass) {
                                    Callback = filter;
                                } else if (className == arrayClass) {
                                    // Convert the property names array into a makeshift set.
                                    properties = {};
                                    for (var index = 0, length = filter.length, value; index < length; value = filter[index++], ((className = getClass.call(value)), className == stringClass || className == numberClass) && (properties[value] = 1));
                                }
                            }
                            if (width) {
                                if ((className = getClass.call(width)) == numberClass) {
                                    // Convert the `width` to an integer and create a string containing
                                    // `width` number of space characters.
                                    if ((width -= width % 1) > 0) {
                                        for (whitespace = "", width > 10 && (width = 10) ; whitespace.length < width; whitespace += " ");
                                    }
                                } else if (className == stringClass) {
                                    whitespace = width.length <= 10 ? width : width.slice(0, 10);
                                }
                            }
                            // Opera <= 7.54u2 discards the values associated with empty string keys
                            // (`""`) only if they are used directly within an object member list
                            // (e.g., `!("" in { "": 1})`).
                            return serialize("", (value = {}, value[""] = source, value), Callback, properties, whitespace, "", []);
                        };
                    }

                    // Public: Parses a JSON source string.
                    if (!has("json-parse")) {
                        var fromCharCode = String.fromCharCode;

                        // Internal: A map of escaped control characters and their unescaped
                        // equivalents.
                        var Unescapes = {
                            92: "\\",
                            34: '"',
                            47: "/",
                            98: "\b",
                            116: "\t",
                            110: "\n",
                            102: "\f",
                            114: "\r"
                        };

                        // Internal: Stores the parser state.
                        var Index, Source;

                        // Internal: Resets the parser state and throws a `SyntaxError`.
                        var abort = function () {
                            Index = Source = null;
                            throw SyntaxError();
                        };

                        // Internal: Returns the next token, or `"$"` if the parser has reached
                        // the end of the source string. A token may be a string, number, `null`
                        // literal, or Boolean literal.
                        var lex = function () {
                            var source = Source, length = source.length, value, begin, position, isSigned, charCode;
                            while (Index < length) {
                                charCode = source.charCodeAt(Index);
                                switch (charCode) {
                                    case 9: case 10: case 13: case 32:
                                        // Skip whitespace tokens, including tabs, carriage returns, line
                                        // feeds, and space characters.
                                        Index++;
                                        break;
                                    case 123: case 125: case 91: case 93: case 58: case 44:
                                        // Parse a punctuator token (`{`, `}`, `[`, `]`, `:`, or `,`) at
                                        // the current position.
                                        value = charIndexBuggy ? source.charAt(Index) : source[Index];
                                        Index++;
                                        return value;
                                    case 34:
                                        // `"` delimits a JSON string; advance to the next character and
                                        // begin parsing the string. String tokens are prefixed with the
                                        // sentinel `@` character to distinguish them from punctuators and
                                        // end-of-string tokens.
                                        for (value = "@", Index++; Index < length;) {
                                            charCode = source.charCodeAt(Index);
                                            if (charCode < 32) {
                                                // Unescaped ASCII control characters (those with a code unit
                                                // less than the space character) are not permitted.
                                                abort();
                                            } else if (charCode == 92) {
                                                // A reverse solidus (`\`) marks the beginning of an escaped
                                                // control character (including `"`, `\`, and `/`) or Unicode
                                                // escape sequence.
                                                charCode = source.charCodeAt(++Index);
                                                switch (charCode) {
                                                    case 92: case 34: case 47: case 98: case 116: case 110: case 102: case 114:
                                                        // Revive escaped control characters.
                                                        value += Unescapes[charCode];
                                                        Index++;
                                                        break;
                                                    case 117:
                                                        // `\u` marks the beginning of a Unicode escape sequence.
                                                        // Advance to the first character and validate the
                                                        // four-digit code point.
                                                        begin = ++Index;
                                                        for (position = Index + 4; Index < position; Index++) {
                                                            charCode = source.charCodeAt(Index);
                                                            // A valid sequence comprises four hexdigits (case-
                                                            // insensitive) that form a single hexadecimal value.
                                                            if (!(charCode >= 48 && charCode <= 57 || charCode >= 97 && charCode <= 102 || charCode >= 65 && charCode <= 70)) {
                                                                // Invalid Unicode escape sequence.
                                                                abort();
                                                            }
                                                        }
                                                        // Revive the escaped character.
                                                        value += fromCharCode("0x" + source.slice(begin, Index));
                                                        break;
                                                    default:
                                                        // Invalid escape sequence.
                                                        abort();
                                                }
                                            } else {
                                                if (charCode == 34) {
                                                    // An unescaped double-quote character marks the end of the
                                                    // string.
                                                    break;
                                                }
                                                charCode = source.charCodeAt(Index);
                                                begin = Index;
                                                // Optimize for the common case where a string is valid.
                                                while (charCode >= 32 && charCode != 92 && charCode != 34) {
                                                    charCode = source.charCodeAt(++Index);
                                                }
                                                // Append the string as-is.
                                                value += source.slice(begin, Index);
                                            }
                                        }
                                        if (source.charCodeAt(Index) == 34) {
                                            // Advance to the next character and return the revived string.
                                            Index++;
                                            return value;
                                        }
                                        // Unterminated string.
                                        abort();
                                    default:
                                        // Parse numbers and literals.
                                        begin = Index;
                                        // Advance past the negative sign, if one is specified.
                                        if (charCode == 45) {
                                            isSigned = true;
                                            charCode = source.charCodeAt(++Index);
                                        }
                                        // Parse an integer or floating-point value.
                                        if (charCode >= 48 && charCode <= 57) {
                                            // Leading zeroes are interpreted as octal literals.
                                            if (charCode == 48 && ((charCode = source.charCodeAt(Index + 1)), charCode >= 48 && charCode <= 57)) {
                                                // Illegal octal literal.
                                                abort();
                                            }
                                            isSigned = false;
                                            // Parse the integer component.
                                            for (; Index < length && ((charCode = source.charCodeAt(Index)), charCode >= 48 && charCode <= 57) ; Index++);
                                            // Floats cannot contain a leading decimal point; however, this
                                            // case is already accounted for by the parser.
                                            if (source.charCodeAt(Index) == 46) {
                                                position = ++Index;
                                                // Parse the decimal component.
                                                for (; position < length && ((charCode = source.charCodeAt(position)), charCode >= 48 && charCode <= 57) ; position++);
                                                if (position == Index) {
                                                    // Illegal trailing decimal.
                                                    abort();
                                                }
                                                Index = position;
                                            }
                                            // Parse exponents. The `e` denoting the exponent is
                                            // case-insensitive.
                                            charCode = source.charCodeAt(Index);
                                            if (charCode == 101 || charCode == 69) {
                                                charCode = source.charCodeAt(++Index);
                                                // Skip past the sign following the exponent, if one is
                                                // specified.
                                                if (charCode == 43 || charCode == 45) {
                                                    Index++;
                                                }
                                                // Parse the exponential component.
                                                for (position = Index; position < length && ((charCode = source.charCodeAt(position)), charCode >= 48 && charCode <= 57) ; position++);
                                                if (position == Index) {
                                                    // Illegal empty exponent.
                                                    abort();
                                                }
                                                Index = position;
                                            }
                                            // Coerce the parsed value to a JavaScript number.
                                            return +source.slice(begin, Index);
                                        }
                                        // A negative sign may only precede numbers.
                                        if (isSigned) {
                                            abort();
                                        }
                                        // `true`, `false`, and `null` literals.
                                        if (source.slice(Index, Index + 4) == "true") {
                                            Index += 4;
                                            return true;
                                        } else if (source.slice(Index, Index + 5) == "false") {
                                            Index += 5;
                                            return false;
                                        } else if (source.slice(Index, Index + 4) == "null") {
                                            Index += 4;
                                            return null;
                                        }
                                        // Unrecognized token.
                                        abort();
                                }
                            }
                            // Return the sentinel `$` character if the parser has reached the end
                            // of the source string.
                            return "$";
                        };

                        // Internal: Parses a JSON `value` token.
                        var get = function (value) {
                            var results, hasMembers;
                            if (value == "$") {
                                // Unexpected end of input.
                                abort();
                            }
                            if (typeof value == "string") {
                                if ((charIndexBuggy ? value.charAt(0) : value[0]) == "@") {
                                    // Remove the sentinel `@` character.
                                    return value.slice(1);
                                }
                                // Parse object and array literals.
                                if (value == "[") {
                                    // Parses a JSON array, returning a new JavaScript array.
                                    results = [];
                                    for (; ; hasMembers || (hasMembers = true)) {
                                        value = lex();
                                        // A closing square bracket marks the end of the array literal.
                                        if (value == "]") {
                                            break;
                                        }
                                        // If the array literal contains elements, the current token
                                        // should be a comma separating the previous element from the
                                        // next.
                                        if (hasMembers) {
                                            if (value == ",") {
                                                value = lex();
                                                if (value == "]") {
                                                    // Unexpected trailing `,` in array literal.
                                                    abort();
                                                }
                                            } else {
                                                // A `,` must separate each array element.
                                                abort();
                                            }
                                        }
                                        // Elisions and leading commas are not permitted.
                                        if (value == ",") {
                                            abort();
                                        }
                                        results.push(get(value));
                                    }
                                    return results;
                                } else if (value == "{") {
                                    // Parses a JSON object, returning a new JavaScript object.
                                    results = {};
                                    for (; ; hasMembers || (hasMembers = true)) {
                                        value = lex();
                                        // A closing curly brace marks the end of the object literal.
                                        if (value == "}") {
                                            break;
                                        }
                                        // If the object literal contains members, the current token
                                        // should be a comma separator.
                                        if (hasMembers) {
                                            if (value == ",") {
                                                value = lex();
                                                if (value == "}") {
                                                    // Unexpected trailing `,` in object literal.
                                                    abort();
                                                }
                                            } else {
                                                // A `,` must separate each object member.
                                                abort();
                                            }
                                        }
                                        // Leading commas are not permitted, object property names must be
                                        // double-quoted strings, and a `:` must separate each property
                                        // name and value.
                                        if (value == "," || typeof value != "string" || (charIndexBuggy ? value.charAt(0) : value[0]) != "@" || lex() != ":") {
                                            abort();
                                        }
                                        results[value.slice(1)] = get(lex());
                                    }
                                    return results;
                                }
                                // Unexpected token encountered.
                                abort();
                            }
                            return value;
                        };

                        // Internal: Updates a traversed object member.
                        var update = function (source, property, Callback) {
                            var element = walk(source, property, Callback);
                            if (element === undef) {
                                delete source[property];
                            } else {
                                source[property] = element;
                            }
                        };

                        // Internal: Recursively traverses a parsed JSON object, invoking the
                        // `Callback` function for each value. This is an implementation of the
                        // `Walk(holder, name)` operation defined in ES 5.1 section 15.12.2.
                        var walk = function (source, property, Callback) {
                            var value = source[property], length;
                            if (typeof value == "object" && value) {
                                // `forEach` can't be used to traverse an array in Opera <= 8.54
                                // because its `Object#hasOwnProperty` implementation returns `false`
                                // for array indices (e.g., `![1, 2, 3].hasOwnProperty("0")`).
                                if (getClass.call(value) == arrayClass) {
                                    for (length = value.length; length--;) {
                                        update(value, length, Callback);
                                    }
                                } else {
                                    forEach(value, function (property) {
                                        update(value, property, Callback);
                                    });
                                }
                            }
                            return Callback.call(source, property, value);
                        };

                        // Public: `JSON.parse`. See ES 5.1 section 15.12.2.
                        JSON3.parse = function (source, Callback) {
                            var result, value;
                            Index = 0;
                            Source = "" + source;
                            result = get(lex());
                            // If a JSON string contains multiple tokens, it is invalid.
                            if (lex() != "$") {
                                abort();
                            }
                            // Reset the parser state.
                            Index = Source = null;
                            return Callback && getClass.call(Callback) == functionClass ? walk((value = {}, value[""] = result, value), "", Callback) : result;
                        };
                    }
                }

                // Export for asynchronous module loaders.
                if (isLoader) {
                    define(function () {
                        return JSON3;
                    });
                }
            }(this));

        }, {}], 50: [function (_dereq_, module, exports) {
            module.exports = toArray

            function toArray(list, index) {
                var array = []

                index = index || 0

                for (var i = index || 0; i < list.length; i++) {
                    array[i - index] = list[i]
                }

                return array
            }

        }, {}]
    }, {}, [1])
    (1)
});


/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.
code.google.com/p/crypto-js/wiki/License
*/
var CryptoJS = CryptoJS || function (u, p) {
    var d = {}, l = d.lib = {}, s = function () { }, t = l.Base = { extend: function (a) { s.prototype = this; var c = new s; a && c.mixIn(a); c.hasOwnProperty("init") || (c.init = function () { c.$super.init.apply(this, arguments) }); c.init.prototype = c; c.$super = this; return c }, create: function () { var a = this.extend(); a.init.apply(a, arguments); return a }, init: function () { }, mixIn: function (a) { for (var c in a) a.hasOwnProperty(c) && (this[c] = a[c]); a.hasOwnProperty("toString") && (this.toString = a.toString) }, clone: function () { return this.init.prototype.extend(this) } },
    r = l.WordArray = t.extend({
        init: function (a, c) { a = this.words = a || []; this.sigBytes = c != p ? c : 4 * a.length }, toString: function (a) { return (a || v).stringify(this) }, concat: function (a) { var c = this.words, e = a.words, j = this.sigBytes; a = a.sigBytes; this.clamp(); if (j % 4) for (var k = 0; k < a; k++) c[j + k >>> 2] |= (e[k >>> 2] >>> 24 - 8 * (k % 4) & 255) << 24 - 8 * ((j + k) % 4); else if (65535 < e.length) for (k = 0; k < a; k += 4) c[j + k >>> 2] = e[k >>> 2]; else c.push.apply(c, e); this.sigBytes += a; return this }, clamp: function () {
            var a = this.words, c = this.sigBytes; a[c >>> 2] &= 4294967295 <<
            32 - 8 * (c % 4); a.length = u.ceil(c / 4)
        }, clone: function () { var a = t.clone.call(this); a.words = this.words.slice(0); return a }, random: function (a) { for (var c = [], e = 0; e < a; e += 4) c.push(4294967296 * u.random() | 0); return new r.init(c, a) }
    }), w = d.enc = {}, v = w.Hex = {
        stringify: function (a) { var c = a.words; a = a.sigBytes; for (var e = [], j = 0; j < a; j++) { var k = c[j >>> 2] >>> 24 - 8 * (j % 4) & 255; e.push((k >>> 4).toString(16)); e.push((k & 15).toString(16)) } return e.join("") }, parse: function (a) {
            for (var c = a.length, e = [], j = 0; j < c; j += 2) e[j >>> 3] |= parseInt(a.substr(j,
            2), 16) << 24 - 4 * (j % 8); return new r.init(e, c / 2)
        }
    }, b = w.Latin1 = { stringify: function (a) { var c = a.words; a = a.sigBytes; for (var e = [], j = 0; j < a; j++) e.push(String.fromCharCode(c[j >>> 2] >>> 24 - 8 * (j % 4) & 255)); return e.join("") }, parse: function (a) { for (var c = a.length, e = [], j = 0; j < c; j++) e[j >>> 2] |= (a.charCodeAt(j) & 255) << 24 - 8 * (j % 4); return new r.init(e, c) } }, x = w.Utf8 = { stringify: function (a) { try { return decodeURIComponent(escape(b.stringify(a))) } catch (c) { throw Error("Malformed UTF-8 data"); } }, parse: function (a) { return b.parse(unescape(encodeURIComponent(a))) } },
    q = l.BufferedBlockAlgorithm = t.extend({
        reset: function () { this._data = new r.init; this._nDataBytes = 0 }, _append: function (a) { "string" == typeof a && (a = x.parse(a)); this._data.concat(a); this._nDataBytes += a.sigBytes }, _process: function (a) { var c = this._data, e = c.words, j = c.sigBytes, k = this.blockSize, b = j / (4 * k), b = a ? u.ceil(b) : u.max((b | 0) - this._minBufferSize, 0); a = b * k; j = u.min(4 * a, j); if (a) { for (var q = 0; q < a; q += k) this._doProcessBlock(e, q); q = e.splice(0, a); c.sigBytes -= j } return new r.init(q, j) }, clone: function () {
            var a = t.clone.call(this);
            a._data = this._data.clone(); return a
        }, _minBufferSize: 0
    }); l.Hasher = q.extend({
        cfg: t.extend(), init: function (a) { this.cfg = this.cfg.extend(a); this.reset() }, reset: function () { q.reset.call(this); this._doReset() }, update: function (a) { this._append(a); this._process(); return this }, finalize: function (a) { a && this._append(a); return this._doFinalize() }, blockSize: 16, _createHelper: function (a) { return function (b, e) { return (new a.init(e)).finalize(b) } }, _createHmacHelper: function (a) {
            return function (b, e) {
                return (new n.HMAC.init(a,
                e)).finalize(b)
            }
        }
    }); var n = d.algo = {}; return d
}(Math);
(function () {
    var u = CryptoJS, p = u.lib.WordArray; u.enc.Base64 = {
        stringify: function (d) { var l = d.words, p = d.sigBytes, t = this._map; d.clamp(); d = []; for (var r = 0; r < p; r += 3) for (var w = (l[r >>> 2] >>> 24 - 8 * (r % 4) & 255) << 16 | (l[r + 1 >>> 2] >>> 24 - 8 * ((r + 1) % 4) & 255) << 8 | l[r + 2 >>> 2] >>> 24 - 8 * ((r + 2) % 4) & 255, v = 0; 4 > v && r + 0.75 * v < p; v++) d.push(t.charAt(w >>> 6 * (3 - v) & 63)); if (l = t.charAt(64)) for (; d.length % 4;) d.push(l); return d.join("") }, parse: function (d) {
            var l = d.length, s = this._map, t = s.charAt(64); t && (t = d.indexOf(t), -1 != t && (l = t)); for (var t = [], r = 0, w = 0; w <
            l; w++) if (w % 4) { var v = s.indexOf(d.charAt(w - 1)) << 2 * (w % 4), b = s.indexOf(d.charAt(w)) >>> 6 - 2 * (w % 4); t[r >>> 2] |= (v | b) << 24 - 8 * (r % 4); r++ } return p.create(t, r)
        }, _map: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
    }
})();
(function (u) {
    function p(b, n, a, c, e, j, k) { b = b + (n & a | ~n & c) + e + k; return (b << j | b >>> 32 - j) + n } function d(b, n, a, c, e, j, k) { b = b + (n & c | a & ~c) + e + k; return (b << j | b >>> 32 - j) + n } function l(b, n, a, c, e, j, k) { b = b + (n ^ a ^ c) + e + k; return (b << j | b >>> 32 - j) + n } function s(b, n, a, c, e, j, k) { b = b + (a ^ (n | ~c)) + e + k; return (b << j | b >>> 32 - j) + n } for (var t = CryptoJS, r = t.lib, w = r.WordArray, v = r.Hasher, r = t.algo, b = [], x = 0; 64 > x; x++) b[x] = 4294967296 * u.abs(u.sin(x + 1)) | 0; r = r.MD5 = v.extend({
        _doReset: function () { this._hash = new w.init([1732584193, 4023233417, 2562383102, 271733878]) },
        _doProcessBlock: function (q, n) {
            for (var a = 0; 16 > a; a++) { var c = n + a, e = q[c]; q[c] = (e << 8 | e >>> 24) & 16711935 | (e << 24 | e >>> 8) & 4278255360 } var a = this._hash.words, c = q[n + 0], e = q[n + 1], j = q[n + 2], k = q[n + 3], z = q[n + 4], r = q[n + 5], t = q[n + 6], w = q[n + 7], v = q[n + 8], A = q[n + 9], B = q[n + 10], C = q[n + 11], u = q[n + 12], D = q[n + 13], E = q[n + 14], x = q[n + 15], f = a[0], m = a[1], g = a[2], h = a[3], f = p(f, m, g, h, c, 7, b[0]), h = p(h, f, m, g, e, 12, b[1]), g = p(g, h, f, m, j, 17, b[2]), m = p(m, g, h, f, k, 22, b[3]), f = p(f, m, g, h, z, 7, b[4]), h = p(h, f, m, g, r, 12, b[5]), g = p(g, h, f, m, t, 17, b[6]), m = p(m, g, h, f, w, 22, b[7]),
            f = p(f, m, g, h, v, 7, b[8]), h = p(h, f, m, g, A, 12, b[9]), g = p(g, h, f, m, B, 17, b[10]), m = p(m, g, h, f, C, 22, b[11]), f = p(f, m, g, h, u, 7, b[12]), h = p(h, f, m, g, D, 12, b[13]), g = p(g, h, f, m, E, 17, b[14]), m = p(m, g, h, f, x, 22, b[15]), f = d(f, m, g, h, e, 5, b[16]), h = d(h, f, m, g, t, 9, b[17]), g = d(g, h, f, m, C, 14, b[18]), m = d(m, g, h, f, c, 20, b[19]), f = d(f, m, g, h, r, 5, b[20]), h = d(h, f, m, g, B, 9, b[21]), g = d(g, h, f, m, x, 14, b[22]), m = d(m, g, h, f, z, 20, b[23]), f = d(f, m, g, h, A, 5, b[24]), h = d(h, f, m, g, E, 9, b[25]), g = d(g, h, f, m, k, 14, b[26]), m = d(m, g, h, f, v, 20, b[27]), f = d(f, m, g, h, D, 5, b[28]), h = d(h, f,
            m, g, j, 9, b[29]), g = d(g, h, f, m, w, 14, b[30]), m = d(m, g, h, f, u, 20, b[31]), f = l(f, m, g, h, r, 4, b[32]), h = l(h, f, m, g, v, 11, b[33]), g = l(g, h, f, m, C, 16, b[34]), m = l(m, g, h, f, E, 23, b[35]), f = l(f, m, g, h, e, 4, b[36]), h = l(h, f, m, g, z, 11, b[37]), g = l(g, h, f, m, w, 16, b[38]), m = l(m, g, h, f, B, 23, b[39]), f = l(f, m, g, h, D, 4, b[40]), h = l(h, f, m, g, c, 11, b[41]), g = l(g, h, f, m, k, 16, b[42]), m = l(m, g, h, f, t, 23, b[43]), f = l(f, m, g, h, A, 4, b[44]), h = l(h, f, m, g, u, 11, b[45]), g = l(g, h, f, m, x, 16, b[46]), m = l(m, g, h, f, j, 23, b[47]), f = s(f, m, g, h, c, 6, b[48]), h = s(h, f, m, g, w, 10, b[49]), g = s(g, h, f, m,
            E, 15, b[50]), m = s(m, g, h, f, r, 21, b[51]), f = s(f, m, g, h, u, 6, b[52]), h = s(h, f, m, g, k, 10, b[53]), g = s(g, h, f, m, B, 15, b[54]), m = s(m, g, h, f, e, 21, b[55]), f = s(f, m, g, h, v, 6, b[56]), h = s(h, f, m, g, x, 10, b[57]), g = s(g, h, f, m, t, 15, b[58]), m = s(m, g, h, f, D, 21, b[59]), f = s(f, m, g, h, z, 6, b[60]), h = s(h, f, m, g, C, 10, b[61]), g = s(g, h, f, m, j, 15, b[62]), m = s(m, g, h, f, A, 21, b[63]); a[0] = a[0] + f | 0; a[1] = a[1] + m | 0; a[2] = a[2] + g | 0; a[3] = a[3] + h | 0
        }, _doFinalize: function () {
            var b = this._data, n = b.words, a = 8 * this._nDataBytes, c = 8 * b.sigBytes; n[c >>> 5] |= 128 << 24 - c % 32; var e = u.floor(a /
            4294967296); n[(c + 64 >>> 9 << 4) + 15] = (e << 8 | e >>> 24) & 16711935 | (e << 24 | e >>> 8) & 4278255360; n[(c + 64 >>> 9 << 4) + 14] = (a << 8 | a >>> 24) & 16711935 | (a << 24 | a >>> 8) & 4278255360; b.sigBytes = 4 * (n.length + 1); this._process(); b = this._hash; n = b.words; for (a = 0; 4 > a; a++) c = n[a], n[a] = (c << 8 | c >>> 24) & 16711935 | (c << 24 | c >>> 8) & 4278255360; return b
        }, clone: function () { var b = v.clone.call(this); b._hash = this._hash.clone(); return b }
    }); t.MD5 = v._createHelper(r); t.HmacMD5 = v._createHmacHelper(r)
})(Math);
(function () {
    var u = CryptoJS, p = u.lib, d = p.Base, l = p.WordArray, p = u.algo, s = p.EvpKDF = d.extend({ cfg: d.extend({ keySize: 4, hasher: p.MD5, iterations: 1 }), init: function (d) { this.cfg = this.cfg.extend(d) }, compute: function (d, r) { for (var p = this.cfg, s = p.hasher.create(), b = l.create(), u = b.words, q = p.keySize, p = p.iterations; u.length < q;) { n && s.update(n); var n = s.update(d).finalize(r); s.reset(); for (var a = 1; a < p; a++) n = s.finalize(n), s.reset(); b.concat(n) } b.sigBytes = 4 * q; return b } }); u.EvpKDF = function (d, l, p) {
        return s.create(p).compute(d,
        l)
    }
})();
CryptoJS.lib.Cipher || function (u) {
    var p = CryptoJS, d = p.lib, l = d.Base, s = d.WordArray, t = d.BufferedBlockAlgorithm, r = p.enc.Base64, w = p.algo.EvpKDF, v = d.Cipher = t.extend({
        cfg: l.extend(), createEncryptor: function (e, a) { return this.create(this._ENC_XFORM_MODE, e, a) }, createDecryptor: function (e, a) { return this.create(this._DEC_XFORM_MODE, e, a) }, init: function (e, a, b) { this.cfg = this.cfg.extend(b); this._xformMode = e; this._key = a; this.reset() }, reset: function () { t.reset.call(this); this._doReset() }, process: function (e) { this._append(e); return this._process() },
        finalize: function (e) { e && this._append(e); return this._doFinalize() }, keySize: 4, ivSize: 4, _ENC_XFORM_MODE: 1, _DEC_XFORM_MODE: 2, _createHelper: function (e) { return { encrypt: function (b, k, d) { return ("string" == typeof k ? c : a).encrypt(e, b, k, d) }, decrypt: function (b, k, d) { return ("string" == typeof k ? c : a).decrypt(e, b, k, d) } } }
    }); d.StreamCipher = v.extend({ _doFinalize: function () { return this._process(!0) }, blockSize: 1 }); var b = p.mode = {}, x = function (e, a, b) {
        var c = this._iv; c ? this._iv = u : c = this._prevBlock; for (var d = 0; d < b; d++) e[a + d] ^=
        c[d]
    }, q = (d.BlockCipherMode = l.extend({ createEncryptor: function (e, a) { return this.Encryptor.create(e, a) }, createDecryptor: function (e, a) { return this.Decryptor.create(e, a) }, init: function (e, a) { this._cipher = e; this._iv = a } })).extend(); q.Encryptor = q.extend({ processBlock: function (e, a) { var b = this._cipher, c = b.blockSize; x.call(this, e, a, c); b.encryptBlock(e, a); this._prevBlock = e.slice(a, a + c) } }); q.Decryptor = q.extend({
        processBlock: function (e, a) {
            var b = this._cipher, c = b.blockSize, d = e.slice(a, a + c); b.decryptBlock(e, a); x.call(this,
            e, a, c); this._prevBlock = d
        }
    }); b = b.CBC = q; q = (p.pad = {}).Pkcs7 = { pad: function (a, b) { for (var c = 4 * b, c = c - a.sigBytes % c, d = c << 24 | c << 16 | c << 8 | c, l = [], n = 0; n < c; n += 4) l.push(d); c = s.create(l, c); a.concat(c) }, unpad: function (a) { a.sigBytes -= a.words[a.sigBytes - 1 >>> 2] & 255 } }; d.BlockCipher = v.extend({
        cfg: v.cfg.extend({ mode: b, padding: q }), reset: function () {
            v.reset.call(this); var a = this.cfg, b = a.iv, a = a.mode; if (this._xformMode == this._ENC_XFORM_MODE) var c = a.createEncryptor; else c = a.createDecryptor, this._minBufferSize = 1; this._mode = c.call(a,
            this, b && b.words)
        }, _doProcessBlock: function (a, b) { this._mode.processBlock(a, b) }, _doFinalize: function () { var a = this.cfg.padding; if (this._xformMode == this._ENC_XFORM_MODE) { a.pad(this._data, this.blockSize); var b = this._process(!0) } else b = this._process(!0), a.unpad(b); return b }, blockSize: 4
    }); var n = d.CipherParams = l.extend({ init: function (a) { this.mixIn(a) }, toString: function (a) { return (a || this.formatter).stringify(this) } }), b = (p.format = {}).OpenSSL = {
        stringify: function (a) {
            var b = a.ciphertext; a = a.salt; return (a ? s.create([1398893684,
            1701076831]).concat(a).concat(b) : b).toString(r)
        }, parse: function (a) { a = r.parse(a); var b = a.words; if (1398893684 == b[0] && 1701076831 == b[1]) { var c = s.create(b.slice(2, 4)); b.splice(0, 4); a.sigBytes -= 16 } return n.create({ ciphertext: a, salt: c }) }
    }, a = d.SerializableCipher = l.extend({
        cfg: l.extend({ format: b }), encrypt: function (a, b, c, d) { d = this.cfg.extend(d); var l = a.createEncryptor(c, d); b = l.finalize(b); l = l.cfg; return n.create({ ciphertext: b, key: c, iv: l.iv, algorithm: a, mode: l.mode, padding: l.padding, blockSize: a.blockSize, formatter: d.format }) },
        decrypt: function (a, b, c, d) { d = this.cfg.extend(d); b = this._parse(b, d.format); return a.createDecryptor(c, d).finalize(b.ciphertext) }, _parse: function (a, b) { return "string" == typeof a ? b.parse(a, this) : a }
    }), p = (p.kdf = {}).OpenSSL = { execute: function (a, b, c, d) { d || (d = s.random(8)); a = w.create({ keySize: b + c }).compute(a, d); c = s.create(a.words.slice(b), 4 * c); a.sigBytes = 4 * b; return n.create({ key: a, iv: c, salt: d }) } }, c = d.PasswordBasedCipher = a.extend({
        cfg: a.cfg.extend({ kdf: p }), encrypt: function (b, c, d, l) {
            l = this.cfg.extend(l); d = l.kdf.execute(d,
            b.keySize, b.ivSize); l.iv = d.iv; b = a.encrypt.call(this, b, c, d.key, l); b.mixIn(d); return b
        }, decrypt: function (b, c, d, l) { l = this.cfg.extend(l); c = this._parse(c, l.format); d = l.kdf.execute(d, b.keySize, b.ivSize, c.salt); l.iv = d.iv; return a.decrypt.call(this, b, c, d.key, l) }
    })
}();
(function () {
    for (var u = CryptoJS, p = u.lib.BlockCipher, d = u.algo, l = [], s = [], t = [], r = [], w = [], v = [], b = [], x = [], q = [], n = [], a = [], c = 0; 256 > c; c++) a[c] = 128 > c ? c << 1 : c << 1 ^ 283; for (var e = 0, j = 0, c = 0; 256 > c; c++) { var k = j ^ j << 1 ^ j << 2 ^ j << 3 ^ j << 4, k = k >>> 8 ^ k & 255 ^ 99; l[e] = k; s[k] = e; var z = a[e], F = a[z], G = a[F], y = 257 * a[k] ^ 16843008 * k; t[e] = y << 24 | y >>> 8; r[e] = y << 16 | y >>> 16; w[e] = y << 8 | y >>> 24; v[e] = y; y = 16843009 * G ^ 65537 * F ^ 257 * z ^ 16843008 * e; b[k] = y << 24 | y >>> 8; x[k] = y << 16 | y >>> 16; q[k] = y << 8 | y >>> 24; n[k] = y; e ? (e = z ^ a[a[a[G ^ z]]], j ^= a[a[j]]) : e = j = 1 } var H = [0, 1, 2, 4, 8,
    16, 32, 64, 128, 27, 54], d = d.AES = p.extend({
        _doReset: function () {
            for (var a = this._key, c = a.words, d = a.sigBytes / 4, a = 4 * ((this._nRounds = d + 6) + 1), e = this._keySchedule = [], j = 0; j < a; j++) if (j < d) e[j] = c[j]; else { var k = e[j - 1]; j % d ? 6 < d && 4 == j % d && (k = l[k >>> 24] << 24 | l[k >>> 16 & 255] << 16 | l[k >>> 8 & 255] << 8 | l[k & 255]) : (k = k << 8 | k >>> 24, k = l[k >>> 24] << 24 | l[k >>> 16 & 255] << 16 | l[k >>> 8 & 255] << 8 | l[k & 255], k ^= H[j / d | 0] << 24); e[j] = e[j - d] ^ k } c = this._invKeySchedule = []; for (d = 0; d < a; d++) j = a - d, k = d % 4 ? e[j] : e[j - 4], c[d] = 4 > d || 4 >= j ? k : b[l[k >>> 24]] ^ x[l[k >>> 16 & 255]] ^ q[l[k >>>
            8 & 255]] ^ n[l[k & 255]]
        }, encryptBlock: function (a, b) { this._doCryptBlock(a, b, this._keySchedule, t, r, w, v, l) }, decryptBlock: function (a, c) { var d = a[c + 1]; a[c + 1] = a[c + 3]; a[c + 3] = d; this._doCryptBlock(a, c, this._invKeySchedule, b, x, q, n, s); d = a[c + 1]; a[c + 1] = a[c + 3]; a[c + 3] = d }, _doCryptBlock: function (a, b, c, d, e, j, l, f) {
            for (var m = this._nRounds, g = a[b] ^ c[0], h = a[b + 1] ^ c[1], k = a[b + 2] ^ c[2], n = a[b + 3] ^ c[3], p = 4, r = 1; r < m; r++) var q = d[g >>> 24] ^ e[h >>> 16 & 255] ^ j[k >>> 8 & 255] ^ l[n & 255] ^ c[p++], s = d[h >>> 24] ^ e[k >>> 16 & 255] ^ j[n >>> 8 & 255] ^ l[g & 255] ^ c[p++], t =
            d[k >>> 24] ^ e[n >>> 16 & 255] ^ j[g >>> 8 & 255] ^ l[h & 255] ^ c[p++], n = d[n >>> 24] ^ e[g >>> 16 & 255] ^ j[h >>> 8 & 255] ^ l[k & 255] ^ c[p++], g = q, h = s, k = t; q = (f[g >>> 24] << 24 | f[h >>> 16 & 255] << 16 | f[k >>> 8 & 255] << 8 | f[n & 255]) ^ c[p++]; s = (f[h >>> 24] << 24 | f[k >>> 16 & 255] << 16 | f[n >>> 8 & 255] << 8 | f[g & 255]) ^ c[p++]; t = (f[k >>> 24] << 24 | f[n >>> 16 & 255] << 16 | f[g >>> 8 & 255] << 8 | f[h & 255]) ^ c[p++]; n = (f[n >>> 24] << 24 | f[g >>> 16 & 255] << 16 | f[h >>> 8 & 255] << 8 | f[k & 255]) ^ c[p++]; a[b] = q; a[b + 1] = s; a[b + 2] = t; a[b + 3] = n
        }, keySize: 8
    }); u.AES = p._createHelper(d)
})();

var Cypherkey = "";
var Type = "";
var key_size = "";

function IsValidAESType(AESType) {
    switch (AESType.toString()) {
        case "128":
            Type = 128;
            key_size = 16;
            break;
        case "192":
            Type = 192;
            key_size = 24;
            break;
        case "256":
            Type = 256;
            key_size = 32;
            break;
    }
    if (key_size && key_size != "") {
        return true;
    }
    else {
        return false;
    }
}

var YalgaarEncrypt = function (data) {
    if (Cypherkey) {
        var encryptedText = encrypt(data, Cypherkey);
        return encryptedText;
    }
    else {
        return data;
    }
}

var YalgaarDecrypt = function (data) {
    if (Cypherkey) {
        var decryptedText = decrypt(data, Cypherkey);
        return decryptedText;
    }
    else {
        return data;
    }
}

var encrypt = function (plainText, key) {
    key = String(key + "00000000000000000000000000000000").slice(0, key_size);
    var C = CryptoJS;
    plainText = C.enc.Utf8.parse(plainText);
    key = C.enc.Utf8.parse(key);
    var aes = C.algo.AES.createEncryptor(key, {
        mode: C.mode.CBC,
        padding: C.pad.Pkcs7,
        keySize: Type,
        iv: key
    });
    var encrypted = aes.finalize(plainText);
    return C.enc.Base64.stringify(encrypted);
}

var decrypt = function (encryptedText, key) {
    key = String(key + "00000000000000000000000000000000").slice(0, key_size);
    var C = CryptoJS;
    encryptedText = C.enc.Base64.parse(encryptedText);
    key = C.enc.Utf8.parse(key);
    var aes = C.algo.AES.createDecryptor(key, {
        mode: C.mode.CBC,
        padding: C.pad.Pkcs7,
        keySize: Type,
        iv: key
    });
    var decrypted = aes.finalize(encryptedText);
    return C.enc.Utf8.stringify(decrypted);
}

function ConnectToYalgaar(YalgaarSetup) {
    if (typeof YalgaarSetup.ClientKey === 'string' && YalgaarSetup.ClientKey && (typeof YalgaarSetup.SSL === 'boolean')) {
        if (YalgaarSetup.UUID) {
            if (checkregexuser(YalgaarSetup.UUID.toString()) == false) {
                YalgaarSetup.Error('Invalid UUID. Only alpha numeric,hyphens,@,underscore allowed and maximum length must be 50');
                return;
            }
        }

        if (!YalgaarSetup.AESSecretKey && YalgaarSetup.AESType || YalgaarSetup.AESSecretKey && !YalgaarSetup.AESType) {
            YalgaarSetup.Error('Both parameters are required : AESSecretKey and AESType');
            return;
        }
        if (YalgaarSetup.AESSecretKey && !typeof YalgaarSetup.AESSecretKey === 'string') {
            YalgaarSetup.Error('Invalid parameter : AESSecretKey');
            return;
        }
        if (YalgaarSetup.AESType && !IsValidAESType(YalgaarSetup.AESType)) {
            YalgaarSetup.Error('Invalid parameter : AESType');
            return;
        }
        Cypherkey = YalgaarSetup.AESSecretKey;

        var l_uri = '';
        if (YalgaarSetup.SSL == true) {
             l_uri = 'https://192.168.60.6:8090';
        }
        else {
            //l_uri = 'http://192.168.60.6:8089';
            //l_uri = 'http://192.168.56.101:8089';
            l_uri = 'http://192.168.0.161:8089';
        }
        yalgaar = io.connect(l_uri,
            {
                query: "token=" + YalgaarSetup.ClientKey + "?" + YalgaarSetup.UUID,
                'force new connection': true,
                transports: ['websocket']
            });

        yalgaar.on('connect', function () {
            YalgaarSetup.Callback('Connected Successfully');
        });
        yalgaar.on('disconnect', function () {
            YalgaarSetup.Callback('Client Disconnected');
        });
        yalgaar.on('error', function (acknowledgement) {
            YalgaarSetup.Error(acknowledgement)
        });

    }
    else {
        YalgaarSetup.Error('Invalid parameter: ClientKey or SSL');
    }
}
function SubscribeMessage(SubMessageSetup) {
    if (typeof SubMessageSetup.ChannelName === 'string' && SubMessageSetup.ChannelName) {
        for (var i = 0; i < SubMessageSetup.ChannelName.split(',').length; i++) {
            if (checkregexchannel(SubMessageSetup.ChannelName.split(',')[i].toString()) == false) {
                SubMessageSetup.Callback('', 'Invalid subscribe channel. Only alpha numeric,hyphens,@,underscore allowed and maximum length must be 50');
                return;
            }
        }
        yalgaar.removeAllListeners('subscribe');
        yalgaar.removeAllListeners('presence');
        yalgaar.emit('subscribe', SubMessageSetup.ChannelName, function (acknowledgement) {
            SubMessageSetup.Callback('', acknowledgement);
        });
        yalgaar.on('subscribe', function (message) {
            SubMessageSetup.Callback(YalgaarDecrypt(message), '');
        });

        var l_uuid = "";
        yalgaar.emit('getuuid', function (uuid) {
            l_uuid = uuid;
        });
        yalgaar.on('presence', function (message) {
            if (l_uuid != JSON.parse(message).uuid) {
                if (SubMessageSetup.CallbackPresence)
                {
                    SubMessageSetup.CallbackPresence(message, '');
                }
                
            }
        });
    }
    else {
        SubMessageSetup.Callback('', 'Invalid parameter : ChannelName');
    }
}
function PublishMessage(PubMessageSetup) {
    if (typeof PubMessageSetup.ChannelName === 'string' && PubMessageSetup.ChannelName) {
        if (checkregexchannel(PubMessageSetup.ChannelName.toString()) == false) {
            PubMessageSetup.Callback('Invalid publish channel.Only alpha numeric,hyphens,@,underscore allowed and maximum length must be 50');
            return;
        }
        if (typeof PubMessageSetup.Message === 'string' && PubMessageSetup.Message) {
            var encry = YalgaarEncrypt(PubMessageSetup.Message);
            yalgaar.emit('publish', PubMessageSetup.ChannelName, encry, function (acknowledgement) {
                PubMessageSetup.Callback(acknowledgement);
            });
        }
        else {
            PubMessageSetup.Callback('Invalid Message');
        }
    }
    else {
        PubMessageSetup.Callback('Invalid parameter : ChannelName');
    }
}
function UnsubscribeMessage(UnsubMessageSetup) {
    if (typeof UnsubMessageSetup.ChannelName === 'string' && UnsubMessageSetup.ChannelName) {
        for (var i = 0; i < UnsubMessageSetup.ChannelName.split(',').length; i++) {
            if (checkregexchannel(UnsubMessageSetup.ChannelName.split(',')[i].toString()) == false) {
                UnsubMessageSetup.Callback('Invalid un-subscribe channel.Only alpha numeric,hyphens,@,underscore allowed and maximum length must be 50');
                return;
            }
        }
        yalgaar.emit('unsubscribe', UnsubMessageSetup.ChannelName, function (acknowledgement) {
            UnsubMessageSetup.Callback(acknowledgement);
        });
    }
    else {
        UnsubMessageSetup.Callback('Invalid parameter : ChannelName');
    }
}
function GetUUIDList(UuidListSetup) {
    if (typeof UuidListSetup.ChannelName === 'string' && UuidListSetup.ChannelName) {
        if (checkregexchannel(UuidListSetup.ChannelName) == true) {
            yalgaar.emit('userlist', UuidListSetup.ChannelName, function (data, err) {
                UuidListSetup.Callback(data, err);
            });
        }
        else {
            UuidListSetup.Callback("", 'Invalid channel.Only alpha numeric,hyphens,@,underscore allowed and maximum length must be 50');
        }
    }
    else {
        UuidListSetup.Callback("", 'Invalid parameter : ChannelName');
    }
}
function GetChannelList(ChannelListSetup) {
    if (typeof ChannelListSetup.UUID === 'string' && ChannelListSetup.UUID) {
        if (checkregexuser(ChannelListSetup.UUID) == true) {
            yalgaar.emit('channellist', ChannelListSetup.UUID, function (data, err) {
                ChannelListSetup.Callback(data, err);
            });
        }
        else {
            ChannelListSetup.Callback("", 'Invalid UUID.Only alpha numeric,hyphens,@,underscore allowed and maximum length must be 50');
        }
    }
    else {
        ChannelListSetup.Callback("", 'Invalid parameter : UUID');
    }
}
function GetHistory(HistoryMessageSetup) {
    if (typeof HistoryMessageSetup.ChannelName === 'string' && HistoryMessageSetup.ChannelName && typeof HistoryMessageSetup.MessageCount === 'number' && HistoryMessageSetup.MessageCount) {
        if (checkregexchannel(HistoryMessageSetup.ChannelName) == true) {
            if (HistoryMessageSetup.MessageCount > 100)
                HistoryMessageSetup.MessageCount = 100;
            yalgaar.emit('history', HistoryMessageSetup.ChannelName, HistoryMessageSetup.MessageCount, function (data, err) {
                HistoryMessageSetup.Callback(data, err);
            });
        }
        else {
            HistoryMessageSetup.Callback("", 'Invalid channel.Only alpha numeric,hyphens,@,underscore allowed and maximum length must be 50');
        }
    }
    else {
        HistoryMessageSetup.Callback("", 'Invalid parameter : ChannelName or MessageCount');
    }
}

function UniqueId() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 10; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}

function checkregexchannel(input) {
    var regexp = /^[a-zA-Z0-9-_@]{1,50}$/;
    return (regexp.test(input.trim()));
}

function checkregexuser(input) {
    var regexp = /^[a-zA-Z0-9-_@]{1,50}$/;
    return (regexp.test(input.trim()));
}