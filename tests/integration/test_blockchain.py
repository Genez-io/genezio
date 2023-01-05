#!/usr/bin/python3

import os
import test as gnz_test
from utils import read_config_file_to_json

if __name__ == '__main__':
    print("Starting blockchain test...")
    os.chdir("../../examples/blockchain/server/")
    configuration = read_config_file_to_json()
    print("Succesfully read `genezio.yaml`")

    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy(configuration)
    
    print("Success!")
