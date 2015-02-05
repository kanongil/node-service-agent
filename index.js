var Dns = require('dns'),
    HttpAgent = require('http').Agent,
    Util = require('util');

var internals = {};

internals.compareNumbers = function compareNumbers(a, b) {
    a = parseInt(a, 10);
    b = parseInt(b, 10);
    return (a < b ? -1 : (a > b ? 1 : 0));
};

// Sorts the SRV lookup results first by priority, then randomising the server
// order for a given priority. For discussion of handling of priority and
// weighting, see https://github.com/dhruvbird/dns-srv/pull/4
internals.groupSrvRecords = function groupSrvRecords(addrs) {
    var groups = {};  // by priority
    addrs.forEach(function(addr) {
        if (!groups.hasOwnProperty(addr.priority)) {
            groups[addr.priority] = [];
        }

        groups[addr.priority].push(addr);
    });

    var result = [];
    Object.keys(groups).sort(internals.compareNumbers).forEach(function(priority) {
        var group = groups[priority];
        // Calculate the total weight for this priority group
        var totalWeight = 0;
        group.forEach(function(addr) {
            totalWeight += addr.weight;
        });
        while (group.length > 1) {
            // Select the next address (based on the relative weights)
            var w = Math.floor(Math.random() * totalWeight);
            var index = -1;
            while (++index < group.length && w > 0) {
                w -= group[index].weight;
            }
            if (index < group.length) {
                // Remove selected address from the group and add it to the
                // result list.
                var addr = group.splice(index, 1)[0];
                result.push(addr);
                // Adjust the total group weight accordingly
                totalWeight -= addr.weight;
            }
        }
        // Add the final address from this group
        result.push(group[0]);
    });
    return result;
};

var ServiceAgent = function ServiceAgent(options) {
  HttpAgent.call(this, options);

  this.service = '_http._tcp.';
  if (options && options.hasOwnProperty('service')) {
    if (typeof options.service !== 'string') {
      throw new TypeError('Service option must be a string');
    }

    this.service = options.service;
    if (this.service.length && this.service[this.service.length - 1] !== '.') {
      this.service = this.service + '.';
    }
  }
};
Util.inherits(ServiceAgent, HttpAgent);

ServiceAgent.prototype.addRequest = function (req, options) {
  var args = arguments, self = this;

  // support legacy API: addRequest(req, host, port, localAddress)
  if (typeof options === 'string') {
    options = {
      host: options,
      port: arguments[2],
      localAddress: arguments[3]
    };
  }

  Dns.resolveSrv(this.service + options.host, function (err, addrs) {
    if (err || addrs.length === 0) {
      // use passed in values
      return ServiceAgent.super_.prototype.addRequest.apply(self, args);
    }

    var addr = internals.groupSrvRecords(addrs).shift();

    // regenerating stored HTTP header string for request
    // note: blatantly ripped from http-proxy-agent
    req._header = null;
    req.setHeader('host', addr.name + ':' + (addr.port || options.port));
    req._implicitHeader();
    var hasOutput = req.output && req.output.length > 0;
    if (hasOutput) {
      // patching connection write() output buffer with updated header
      // the _header has already been queued to be written to the socket
      var first = req.output[0];
      var endOfHeaders = first.indexOf('\r\n\r\n') + 4;
      req.output[0] = req._header + first.substring(endOfHeaders);
      //console.log('req.output', req.output)
    }

    return ServiceAgent.super_.prototype.addRequest.call(self, req, addr.name, addr.port || options.port, options.localAddress);
  });
};

module.exports = ServiceAgent;
