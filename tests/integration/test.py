#!/usr/bin/python3

import subprocess
import logging
import requests
import socket
import time
import time
from os import path
from termcolor import colored
from os.path import expanduser

from utils import contains_project, get_auth_token, assert_log

def test_genezio_account():
    process = subprocess.run(['genezio', 'account'], capture_output=True, text=True)
    assert_log(process.returncode == 0, process, "genezio account returned non-zero exit code")
    assert_log(process.stderr == "", process, "genezio account returned non-empty stderr")

    # Test if geneziorc file is present
    home = expanduser('~')
    assert_log(path.exists(home + '/' + '.geneziorc'), process, "~/.geneziorc file not found")

    # Test if geneziorc file contains a token 
    auth_token = get_auth_token()
    assert_log(auth_token != "", process, "Auth token not found in ~/.geneziorc")
    assert_log(len(auth_token) == 128, process, "Auth token is not 128 characters long")

    print(colored("Test for " + str(process.args) + " passed", "green"))

def test_genezio_logout():
    process = subprocess.run(['genezio', 'logout'], capture_output=True, text=True)
    assert_log(process.returncode == 0, process, "genezio logout returned non-zero exit code")
    assert_log(process.stderr == "", process, "genezio logout returned non-empty stderr")

    # Test if geneziorc file is deleted
    home = expanduser('~')
    assert_log(path.exists(home + '/' + '.geneziorc') == False, process, "~/.geneziorc file not deleted")

    print(colored("Test for " + str(process.args) + " passed", "green"))

def test_genezio_deploy(configuration):
    process = subprocess.run(['genezio', 'deploy'], capture_output=True, text=True)
    assert_log(process.returncode == 0, process, "genezio deploy returned non-zero exit code")
    assert_log(process.stderr == "", process, "genezio deploy returned non-empty stderr")

    deployed_endpoints = {}
    lines = process.stdout.splitlines()
    for line in lines:
        try:
            name = line.split(":")[0].replace("  - ", "")
            url = line[line.index("https://"):]
            deployed_endpoints[name] = url
        except:
            pass

    # Test if sdk and classes were generated
    sdk = configuration['sdk']

    assert_log(path.isdir(sdk['path']), process, "SDK directory not found")
    if (sdk['language'] == "js"):
        assert_log(path.exists(sdk['path'] + '/remote.js'), process, "remote.js not found")
    elif (sdk['language'] == "ts"):
        assert_log(path.exists(sdk['path'] + '/remote.ts'), process, "remote.ts not found")
    elif (sdk['language'] == "swift"):
        assert_log(path.exists(sdk['path'] + '/remote.swift'), process, "remote.swift not found")

    classes = configuration['classes']
    if not classes:
        logging.warning("Class path not provided. This assertion is skiped...")
    else:
        for c in classes:
            assert_log(path.exists(c['path']), process, "Class path" + c['path'] + " not found")
    
    # Test if project was deployed by querying the backend
    auth_token = get_auth_token()
    endpoint = 'https://dev.api.genez.io/projects?startIndex=0&projectsLimit=100'
    headers = {'Authorization': 'Bearer ' + auth_token}
    r = requests.get(endpoint, headers=headers)
    if "region" not in configuration:
        configuration['region'] = "us-east-1"
    assert_log(contains_project(r.json()['projects'], configuration['name'], configuration['region']), process, "Project not found in backend")

    print(colored("Test for " + str(process.args) + " passed", "green"))

    return deployed_endpoints

def test_genezio_delete(configuration, project_id):
    process = subprocess.run(['genezio', 'delete', project_id, "--force"], capture_output=True, text=True)
    assert_log(process.returncode == 0, process, "genezio delete returned non-zero exit code")
    assert_log(process.stderr == "", process, "genezio delete returned non-empty stderr")

    # Test if project was deleted by querying the backend
    auth_token = get_auth_token()
    endpoint = 'https://dev.api.genez.io/projects?startIndex=0&projectsLimit=100'
    headers = {'Authorization': 'Bearer ' + auth_token}
    r = requests.get(endpoint, headers=headers)
    assert_log(contains_project(r.json()['projects'], configuration['name'], configuration['region']) == False, process, "Project not deleted in backend")

    print(colored("Test for " + str(process.args) + " passed", "green"))

def start_genezio_local():
    process = subprocess.Popen(['genezio', 'local'], stdout=subprocess.PIPE, shell=False, stderr=subprocess.PIPE, text=True, close_fds=True)
    start = time.time()

    while True:
        time.sleep(0.05)
        # Test if port 8083 is listening
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        port_status = sock.connect_ex(('127.0.0.1',8083))

        if port_status == 0:
            break
        
        end = time.time()
        if end - start > 60:
            assert false, "Connecting to port 8083 failed"
    
    return process


# `genezio local` cannot be gracefully terminated
def test_genezio_local(configuration, client_script_name):
    process = subprocess.Popen(['genezio', 'local'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    # Wait until `genezio local` to start listening
    time.sleep(10)

    # Test if port 8083 is listening
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    port_status = sock.connect_ex(('127.0.0.1',8083))
    assert port_status == 0, "Connecting to port 8083 failed"

    # Test if sdk and classes were generated
    sdk = configuration['sdk']
    assert_log(path.isdir(sdk['path']), process, "SDK directory not found")
    assert_log(path.exists(sdk['path'] + '/remote.js'), process, "remote.js not found")
    classes = configuration['classes']
    if not classes:
        logging.warning("Class path not provided. This assertion is skiped...")
    else:
        for c in classes:
            assert_log(path.exists(c['path']), process, "Class " + c['path'] + " not found")

    # Test if client script ran successfully
    test_client_process = subprocess.run(['node', client_script_name], capture_output=True, text=True)
    assert_log(test_client_process.returncode == 0, test_client_process, "genezio remote call returned non-zero exit code")
    assert_log(test_client_process.stderr == "", test_client_process, "genezio remote call returned non-empty stderr")

    # Kill `genezio local` process 
    process.kill()      

    print(colored("Test for " + str(process.args) + " passed", "green"))


def test_genezio_add_class(class_path, class_type = 'jsonrpc'):
    process = subprocess.run(['genezio', 'addClass', class_path, class_type], capture_output=True, text=True)
    assert_log(process.returncode == 0, process, "genezio addClass returned non-zero exit code")
    assert_log(process.stderr == "", process, "genezio addClass returned non-empty stderr")
    assert_log(path.exists(class_path), process, "Class " + class_path + " not found")
    print(colored("Test for " + str(process.args) + " passed", "green"))

def test_genezio_remote_call(script_name):
    process = subprocess.run(['node', script_name], capture_output=True, text=True)
    assert_log(process.returncode == 0, process, "genezio remote call returned non-zero exit code")
    assert_log(process.stderr == "", process, "genezio remote call returned non-empty stderr")
    print(colored("Test for " + str(process.args) + " passed", "green"))
