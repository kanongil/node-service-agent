'use strict';

const Dns = require('dns');
const Http = require('http');

const Code = require('@hapi/code');
const Lab = require('@hapi/lab');
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

    before(() => {

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
    });

    after(() => {

        Dns.resolveSrv = origDnsResolveSrv;
    });

    let server;
    let serverPort;

    before(async () => {

        return await new Promise((resolve) => {

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

                resolve();
            });

            server.on('request', (req, res) => {

                res.end(JSON.stringify(req.headers));
            });
        });
    });

    after(async () => {

        const promise = new Promise((resolve) => {

            server.once('close', resolve);
        });
        server.close();

        await promise;
    });

    describe('constructor', () => {

        it('should inherit from http.Agent', () => {

            const agent = new ServiceAgent();
            expect(agent).to.be.an.instanceof(Http.Agent);
        });

        it('throws on invalid service option', () => {

            const createBadService = () => {

                new ServiceAgent({ service: 10 });
            };

            expect(createBadService).to.throw(TypeError);
        });

        it('respects http.Agent options', () => {

            const agent = new ServiceAgent({ maxSockets: 42 });
            expect(agent.maxSockets).to.equal(42);
        });
    });

    describe('service', () => {

        it('resolves using http.get', async () => {

            const res = await new Promise((resolve, reject) => {

                const req = Http.get({ host: 'localhost', port: 100, agent: new ServiceAgent() }, resolve);
                req.on('error', reject);
                req.end();
            });

            res.destroy();
        });

        it('resolves using the request module', async () => {

            const request = Request.defaults({ agentClass: ServiceAgent });

            const json = await new Promise((resolve, reject) => {

                request('http://localhost/', { json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('resolves a non-GET request', async () => {

            const request = Request.defaults({ agentClass: ServiceAgent });

            const json = await new Promise((resolve, reject) => {

                request.post('http://localhost/', { body: {}, json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('handles custom services', async () => {

            const json = await new Promise((resolve, reject) => {

                Request({ url: 'http://localhost/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp.' }, pool: {}, json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('handles custom services with a port in url', async () => {

            const json = await new Promise((resolve, reject) => {

                Request({ url: 'http://localhost:100/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp.' }, pool: {}, json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('handles custom services with with missing trailing dot', async () => {

            const json = await new Promise((resolve, reject) => {

                Request({ url: 'http://localhost:100/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp' }, pool: {}, json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('resolves blank service option', async () => {

            const request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '' }, pool: {} });

            const json = await new Promise((resolve, reject) => {

                request('http://blank/', { json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('resolves the default port when SRV record port is 0', async () => {

            const request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '_portless._tcp.' }, pool: {} });

            const json = await new Promise((resolve, reject) => {

                request('http://localhost:' + serverPort + '/', { json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('resolves the default port for empty lookup results', async () => {

            const request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '_zero._tcp.' }, pool: {} });

            const json = await new Promise((resolve, reject) => {

                request('http://localhost:' + serverPort + '/', { json: true }, (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            });

            expect(json.host).to.equal('localhost:' + serverPort);
        });

        it('resolves the default port when lookup fails', async () => {

            const request = Request.defaults({ agentClass: ServiceAgent });

            await expect(new Promise((resolve, reject) => {

                request('http://the.holy.grail/', (err, res, data) => {

                    return err ? reject(err) : resolve(data);
                });
            })).reject(/ENOTFOUND/);
        });
    });
});
