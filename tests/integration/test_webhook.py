#!/usr/bin/python3

from os import path
import sys

import test as gnz_test

NODE_FILENAME = "./client/test-webhook-sdk.js"

if __name__ == '__main__':
    print("Starting webhook test...")
    os.chdir("../../examples/webhook/")
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy()
    gnz_test.test_genezio_remote_call(NODE_FILENAME)
    print("Success!")
