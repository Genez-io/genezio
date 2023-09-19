export const pythonSdk = `# This is an auto generated code. This code should not be modified since the file can be overwritten
# if new genezio commands are executed.

import urllib.request
import json
from datetime import datetime

def jsonSerial(obj):
    if isinstance(obj, datetime):
        serial = obj.isoformat()
        return serial
    return obj.__dict__

def makeRequest(requestContent, url):
    data = json.dumps(requestContent, default=jsonSerial).encode('utf8')
    req = urllib.request.Request(url, data=data,
                                 headers={'content-type': 'application/json'})
    response = urllib.request.urlopen(req)

    resp = response.read().decode('utf8')

    return json.loads(resp)


class Remote:
    url = None

    def __init__(self, url):
        self.url = url

    def call(self, method, *args):
        requestContent = {
            "jsonrpc": "2.0",
            "params": args,
            "method": method,
            "id": 3
        }
        response = makeRequest(requestContent, self.url)
        if (response.get('error') != None):
            return response['error']['message']
        else:
            if 'result' in response:
                return response['result']
            else:
                return None
`;
