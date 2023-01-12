#!/usr/bin/python3

import os
import test as gnz_test
import requests

NODE_FILENAME = "../client/test-webhook-sdk.js"

if __name__ == '__main__':
    print("Starting webhook test...")
    os.chdir("../../examples/webhook/server")
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy("../client/sdk/")

    response = requests.get('http://127.0.0.1:8083/HelloWorldCronExample/handleQueryParams?name=john')
    print(response.text)

    print("Success!")
