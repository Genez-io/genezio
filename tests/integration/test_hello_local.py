#!/usr/bin/python3

import os
import test as gnz_test
import utils as gnz_utils

NODE_FILENAME = "../client/test-hello-sdk.js"

# Test order matters because the commands are having side effects.
if __name__ == '__main__':
    print("Starting hello_world for Javascript local test...")

    os.chdir("../../examples/hello-world/server/")
    configuration = gnz_utils.read_config_file_to_json()
    print("Succesfully read `genezio.yaml`")

    gnz_test.test_genezio_local(configuration, NODE_FILENAME)
    print ("Success!")
