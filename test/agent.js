'use strict';

const Dns = require('dns');
const Http = require('http');

const Code = require('code');
const Lab = require('lab');
const Request = require('request');

const ServiceAgent = require('..');

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const before = lab.before;
const after = lab.after;
const it = lab.it;
const expect = Code.expect;

const internals = {
    services: {
        '_zero._tcp.not.there': [],
        '_portless._tcp.localhost': [{
            priority: 10, weight: 5,
            port: 0,
            name: 'localhost'
        }]
    }
};

describe('ServiceAgent', () => {

    let origDnsResolveSrv;

    before((done) => {

        origDnsResolveSrv = Dns.resolveSrv;
        Dns.resolveSrv = (domain, callback) => {

            const list = internals.services[domain];
            if (list) {
                if (list.syncReply) {
                    return callback(null, list);
                }

                return setImmediate(callback, null, list);
            }

            return origDnsResolveSrv.call(Dns, domain, callback);
        };
        done();
    });

    after((done) => {

        Dns.resolveSrv = origDnsResolveSrv;
        done();
    });

    let server;
    let serverPort;

    before((done) => {

        server = Http.createServer();
        server.listen(() => {

            serverPort = server.address().port;

            // 'register' services
            internals.services['_http._tcp.localhost'] = [{
                priority: 10, weight: 5,
                port: serverPort,
                name: 'localhost'
            }];
            internals.services['_http._tcp.localhost'].syncReply = true;

            internals.services.blank = [{
                priority: 10, weight: 5,
                port: serverPort,
                name: 'localhost'
            }];

            internals.services['_test._tcp.localhost'] = [{
                priority: 10, weight: 5,
                port: serverPort,
                name: 'localhost'
            }, {
                priority: 10, weight: 5,
                port: serverPort,
                name: 'localhost'
            }, {
                priority: 50, weight: 5,
                port: 100,
                name: 'localhost'
            }];

            done();
        });
        server.on('request', (req, res) => {

            res.end(JSON.stringify(req.headers));
        });
    });

    after((done) => {

        server.once('close', done);
        server.close();
    });

    describe('constructor', () => {

        it('should inherit from http.Agent', (done) => {

            const agent = new ServiceAgent();
            expect(agent).to.be.an.instanceof(Http.Agent);
            done();
        });

        it('throws on invalid service option', (done) => {

            const createBadService = () => {

                new ServiceAgent({ service: 10 });
            };

            expect(createBadService).to.throw(TypeError);
            done();
        });

        it('respects http.Agent options', (done) => {

            const agent = new ServiceAgent({ maxSockets: 42 });
            expect(agent.maxSockets).to.equal(42);
            done();
        });

    });

    describe('service', () => {

        it('resolves using http.get', (done) => {

            Http.get({ host: 'localhost', port: 100, agent: new ServiceAgent() }, (res) => {

                res.destroy();
                done();
            }).end();
        });

        it('resolves using the request module', (done) => {

            const request = Request.defaults({ agentClass: ServiceAgent });

            request('http://localhost/', { json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('resolves a non-GET request', (done) => {

            const request = Request.defaults({ agentClass: ServiceAgent });

            request.post('http://localhost/', { body: {}, json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('handles custom services', (done) => {

            Request({ url: 'http://localhost/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp.' }, pool: {}, json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('handles custom services with a port in url', (done) => {

            Request({ url: 'http://localhost:100/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp.' }, pool: {}, json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('handles custom services with with missing trailing dot', (done) => {

            Request({ url: 'http://localhost:100/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp' }, pool: {}, json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('resolves blank service option', (done) => {

            const request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '' }, pool: {} });

            request('http://blank/', { json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('resolves the default port when SRV record port is 0', (done) => {

            const request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '_portless._tcp.' }, pool: {} });

            request('http://localhost:' + serverPort + '/', { json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('resolves the default port for empty lookup results', (done) => {

            const request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '_zero._tcp.' }, pool: {} });

            request('http://localhost:' + serverPort + '/', { json: true }, (err, res, json) => {

                expect(err).to.not.exist();
                expect(json.host).to.equal('localhost:' + serverPort);
                done();
            });
        });

        it('resolves the default port when lookup fails', (done) => {

            const request = Request.defaults({ agentClass: ServiceAgent });

            request('http://the.holy.grail/', (err/*, res, body*/) => {

                expect(err).to.exist();
                done();
            });
        });
    });
});
