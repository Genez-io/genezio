#!/usr/bin/python3

import subprocess
from os import path
from termcolor import colored

def assert_log(condition, process):
    assert condition, colored("Test for " + str(process.args) + " failed\nstderr: " + process.stderr, "red")

def test_genezio_account():
    process = subprocess.run(['genezio', 'account'], capture_output=True, text=True)
    assert_log(process.returncode == 0, process)
    assert_log(process.stderr == "", process)
    print(colored("Test for " + str(process.args) + " passed", "green"))

def test_genezio_logout():
    process = subprocess.run(['genezio', 'logout'], capture_output=True, text=True)
    assert_log(process.returncode == 0, process)
    assert_log(process.stderr == "", process)
    print(colored("Test for " + str(process.args) + " passed", "green"))

# TODO Add test agains dev DB for `genezio deploy
def test_genezio_deploy(sdkPath = './sdk'):
    process = subprocess.run(['genezio', 'deploy'], capture_output=True, text=True)
    assert_log(process.returncode == 0, process)
    assert_log(process.stderr == "", process)
    assert_log(path.exists(sdkPath + '/remote.js'), process)
    assert_log(path.isdir(sdkPath), process)
    print(colored("Test for " + str(process.args) + " passed", "green"))

# TODO Fix `genezio local`
def test_genezio_local():
    process = subprocess.run(['genezio', 'local'], capture_output=True, text=True, timeout=10)
    
    # Use default port = 8083 to test
    port_process = subprocess.run(['curl', '-X', 'OPTIONS', 'localhost:8083'], capture_output=True, text=True)

    assert_log(process.returncode == 0, process)
    assert_log(process.stderr == "", process)
    assert_log(port_process.returncode == 0, port_process)
    assert_log(path.isdir('./sdk'), process)
    assert_log(path.exists('./sdk/remote.js'), process)
    print(colored("Test for " + str(process.args) + " passed", "green"))

def test_genezio_add_class(class_path = './testAddClass.js', class_type = 'jsonrpc'):
    process = subprocess.run(['genezio', 'addClass', class_path, class_type], capture_output=True, text=True)
    assert_log(process.returncode == 0, process)
    assert_log(process.stderr == "", process)
    assert_log(path.exists(class_path), process)
    print(colored("Test for " + str(process.args) + " passed", "green"))

# TODO Add tests for `genezio delete`
def test_delete():
    return

def test_genezio_remote_call(script_name):
    process = subprocess.run(['node', script_name], capture_output=True, text=True)
    assert_log(process.returncode == 0, process)
    assert_log(process.stderr == "", process)
    print(colored("Test for " + str(process.args) + " passed", "green"))

# TODO Clean all the projects from dev database before launching the tests
def clean_all():
    return

def clean():
    subprocess.run(['rm', '-rf', './sdk'])
    return
