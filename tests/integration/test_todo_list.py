#!/usr/bin/python3

import os
import test as gnz_test

if __name__ == '__main__':
    print("Starting TO-DO List test...")
    os.chdir("../../examples/todo-list/server/")
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy("../client/src/sdk")
    print("Success!")
