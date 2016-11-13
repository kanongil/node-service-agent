'use strict';

const Dns = require('dns');
const HttpAgent = require('http').Agent;
const Util = require('util');

const internals = {};

internals.compareNumbers = function compareNumbers(a, b) {

    a = parseInt(a, 10);
    b = parseInt(b, 10);
    return (a < b ? -1 : (a > b ? 1 : 0));
};

// Sorts the SRV lookup results first by priority, then randomising the server
// order for a given priority. For discussion of handling of priority and
// weighting, see https://github.com/dhruvbird/dns-srv/pull/4
internals.groupSrvRecords = function groupSrvRecords(addrs) {

    const groups = {};  // by priority
    addrs.forEach((addr) => {

        if (!groups.hasOwnProperty(addr.priority)) {
            groups[addr.priority] = [];
        }

        groups[addr.priority].push(addr);
    });

    const result = [];
    Object.keys(groups).sort(internals.compareNumbers).forEach((priority) => {

        const group = groups[priority];

        // Calculate the total weight for this priority group

        let totalWeight = 0;
        for (let i = 0; i < group.length; ++i) {
            totalWeight += group[i].weight;
        }

        // Find a weighted address

        while (group.length > 1) {
            // Select the next address (based on the relative weights)
            let w = Math.floor(Math.random() * totalWeight);
            let index = -1;
            while (++index < group.length && w > 0) {
                w -= group[index].weight;
            }

            if (index < group.length) {
                // Remove selected address from the group and add it to the
                // result list.
                const addr = group.splice(index, 1)[0];
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

const ServiceAgent = function ServiceAgent(options) {

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

    const args = arguments;

    Dns.resolveSrv(this.service + options.host, (err, addrs) => {

        if (err || addrs.length === 0) {
            // use passed in values
            return ServiceAgent.super_.prototype.addRequest.apply(this, args);
        }

        const addr = internals.groupSrvRecords(addrs).shift();

        // regenerating stored HTTP header string for request
        // note: blatantly ripped from http-proxy-agent
        req._header = null;
        req.setHeader('host', addr.name + ':' + (addr.port || options.port));
        req._implicitHeader();
        const hasOutput = req.output && req.output.length > 0;
        if (hasOutput) {
            // patching connection write() output buffer with updated header
            // the _header has already been queued to be written to the socket
            const first = req.output[0];
            const endOfHeaders = first.indexOf('\r\n\r\n') + 4;
            req.output[0] = req._header + first.substring(endOfHeaders);
            //console.log('req.output', req.output)
        }

        return ServiceAgent.super_.prototype.addRequest.call(this, req, addr.name, addr.port || options.port, options.localAddress);
    });
};


module.exports = ServiceAgent;
