#!/usr/bin/python3

from os import path
import sys
# Add local testing module
sys.path.insert(1, '../tests/')
import test as gnz_test

NODE_FILENAME = "test-hello-sdk.js"

if __name__ == '__main__':
    print("Test `genezio account`")
    gnz_test.test_genezio_account()
    print("Test `genezio deploy`")
    gnz_test.test_genezio_deploy()
    print("Test `node " + NODE_FILENAME + "`")
    gnz_test.test_genezio_remote_call(NODE_FILENAME, "Hello world")
