# service-agent for node.js

![Node.js CI](https://github.com/kanongil/node-service-agent/workflows/Node.js%20CI/badge.svg)

HTTP agent that connects to services defined in DNS SRV records, enabling transparent service discovery for any HTTP-based protocol.

Just add the agent to your request, and it will connect to the service.

## Usage

Using the popular `request` module:

```javascript
const ServiceAgent = require('service-agent');
const Request = require('request');

const request = Request.defaults({
  agentClass: ServiceAgent,
  agentOptions: { service:'_http._tcp.' },
  pool: {}
});

request('http://pkg.freebsd.org/', function(error, result, body) {
  …
});
```

Note that you need to set the `pool` option whenever you specify the `service` when creating the agent. Otherwise, `request` will mix multiple services together.

### Options

 * `service`: Service designator to look for, prepended to the hostname. Defaults to `_http._tcp.`.

### Limitations

 * Services are not checked for connectivity. Currently, it will only select a weighted random service at the highest priority.
 * SSL is not supported.

Pull request to fix these issues are welcome.

## Installation

```sh
$ npm install service-agent
```

# License

(BSD 2-Clause License)

Copyright (c) 2015-2020, Gil Pedersen &lt;gpdev@gpost.dk&gt;
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.