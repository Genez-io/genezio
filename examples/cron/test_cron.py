#!/usr/bin/python3

from os import path
import sys
# Add local testing module
sys.path.insert(1, '../../tests/integration/')
import test as gnz_test

if __name__ == '__main__':
    print("Starting cron test...")
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy()
    print("Success!")
