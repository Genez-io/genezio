#!/usr/bin/python3

import os
import test as gnz_test

if __name__ == '__main__':
    print("Starting cron test...")
    os.chdir("../../examples/cron/")
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy()
    print("Success!")
