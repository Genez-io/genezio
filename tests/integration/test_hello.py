#!/usr/bin/python3

import os
import test as gnz_test

NODE_FILENAME = "../client/test-hello-sdk.js"

# Test order matters because the commands are having side effects. E.g:
# `genezio deploy` creates an SDK
# `genezo addClass` creates an empty file class and adds it to `genezio.yaml`
if __name__ == '__main__':
    print("Starting Hello World test...")
    os.chdir("../../examples/hello-world/server/")
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy("../client/sdk/")
    gnz_test.test_genezio_add_class()
    gnz_test.test_genezio_remote_call(NODE_FILENAME)
    print ("Success!")
