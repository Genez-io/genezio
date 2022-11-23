#!/usr/bin/python3

from os import path
import sys
# Add local testing module
sys.path.insert(1, '../tests/')
import test as gnz_test

NODE_FILENAME = "test-hello-sdk.js"

# Test order matters because the commands are having side effects. E.g:
# `genezio deploy` creates an SDK
# `genezo addClass` creates an empty file class and adds it to `genezio.yaml`
if __name__ == '__main__':
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy()
    gnz_test.test_genezio_add_class()
    gnz_test.test_genezio_remote_call(NODE_FILENAME)
