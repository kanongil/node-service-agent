var Dns = require('dns'),
    Http = require('http');

var Code = require('code'),
    Lab = require('lab'),
    Request = require('request');

var ServiceAgent = require('..');

var lab = exports.lab = Lab.script();
var describe = lab.describe;
var before = lab.before;
var after = lab.after;
var it = lab.it;
var expect = Code.expect;

var internals = {
  services: {
    '_zero._tcp.not.there': [],
    '_portless._tcp.localhost': [{
      priority: 10, weight: 5,
      port: 0,
      name: 'localhost'
    }]
  }
};

describe('ServiceAgent', function () {

  var origDnsResolveSrv;

  before(function (done) {
    origDnsResolveSrv = Dns.resolveSrv;
    Dns.resolveSrv = function(domain, callback) {
      var list = internals.services[domain];
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

  after(function (done) {
    Dns.resolveSrv = origDnsResolveSrv;
    done();
  });

  var server;
  var serverPort;

  before(function (done) {
    server = Http.createServer();
    server.listen(function () {
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
    server.on('request', function (req, res) {
      res.end(JSON.stringify(req.headers));
    });
  });

  after(function (done) {
    server.once('close', function () { done(); });
    server.close();
  });

  describe('constructor', function () {

    it('should inherit from http.Agent', function(done) {
      var agent = new ServiceAgent();
      expect(agent).to.be.an.instanceof(Http.Agent);
      done();
    });

    it('throws on invalid service option', function(done) {
      var createBadService = function () {
        var agent = new ServiceAgent({ service: 10 });
      };

      expect(createBadService).to.throw(TypeError);
      done();
    });

    it('respects http.Agent options', function(done) {
      var agent = new ServiceAgent({ maxSockets: 42 });
      expect(agent.maxSockets).to.equal(42);
      done();
    });

  });

  describe('service', function () {

    it('resolves using http.get', function (done) {
      Http.get({ host: 'localhost', port: 100, agent: new ServiceAgent() }, function(res) {
        res.destroy();
        done();
      }).end();
    });

    it('resolves using the request module', function (done) {
      var request = Request.defaults({ agentClass: ServiceAgent });

      request('http://localhost/', { json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('resolves a non-GET request', function (done) {
      var request = Request.defaults({ agentClass: ServiceAgent });

      request.post('http://localhost/', { body: {}, json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('handles custom services', function (done) {
      Request({ url: 'http://localhost/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp.' }, pool: {}, json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('handles custom services with a port in url', function (done) {
      Request({ url: 'http://localhost:100/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp.' }, pool: {}, json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('handles custom services with with missing trailing dot', function (done) {
      Request({ url: 'http://localhost:100/', agentClass: ServiceAgent, agentOptions: { service: '_test._tcp' }, pool: {}, json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('resolves blank service option', function (done) {
      var request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '' }, pool: {} });

      request('http://blank/', { json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('resolves the default port when SRV record port is 0', function (done) {
      var request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '_portless._tcp.' }, pool: {} });

      request('http://localhost:' + serverPort + '/', { json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('resolves the default port for empty lookup results', function (done) {
      var request = Request.defaults({ agentClass: ServiceAgent, agentOptions: { service: '_zero._tcp.' }, pool: {} });

      request('http://localhost:' + serverPort + '/', { json: true }, function(err, res, json) {
        expect(err).to.not.exist();
        expect(json.host).to.equal('localhost:' + serverPort);
        done();
      });
    });

    it('resolves the default port when lookup fails', function (done) {
      var request = Request.defaults({ agentClass: ServiceAgent });

      request('http://the.holy.grail/', function(err/*, res, body*/) {
        expect(err).to.exist();
        done();
      });
    });

  });

});
