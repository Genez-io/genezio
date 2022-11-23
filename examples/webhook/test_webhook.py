#!/usr/bin/python3

from os import path
import sys
# Add local testing module
sys.path.insert(1, '../tests/')
import test as gnz_test

NODE_FILENAME = "test-webhook-sdk.js"

if __name__ == '__main__':
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy()
    gnz_test.test_genezio_remote_call(NODE_FILENAME)
