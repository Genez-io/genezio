#!/usr/bin/python3

import subprocess
from os import path

def test_genezio_account():
    process = subprocess.run(['genezio', 'account'], capture_output=True, text=True)
    assert process.returncode == 0
    assert process.stderr == ""
    assert "Logged in as:" in process.stdout

def test_genezio_logout():
    process = subprocess.run(['genezio', 'logout'], capture_output=True, text=True)
    assert process.returncode == 0
    assert process.stderr == ""
    assert "You are now logged out" in process.stdout

def test_genezio_deploy():
    process = subprocess.run(['genezio', 'deploy'], capture_output=True, text=True)
    assert process.returncode == 0
    assert process.stderr == ""
    assert "Your code was deployed and the SDK was successfully generated" in process.stdout
    assert path.exists('./sdk/remote.js')
    assert path.isdir('./sdk')

def test_genezio_local():
    process = subprocess.run(['genezio', 'local'], capture_output=True, text=True)    
    assert process.returncode == 0
    assert process.stderr == ""
    assert path.isdir('./sdk')
    assert path.exists('./sdk/remote.js')

def test_add_class(class_path = './', class_type = 'jsonrpc'):
    process = subprocess.run(['genezio', 'addClass', class_path, class_type], capture_output=True, text=True)    
    assert process.returncode == 0
    assert process.stderr == ""
    assert path.exists(class_path)

def test_genezio_remote_call(script_name, out_message):
    deploy_process = subprocess.run(['node', script_name], capture_output=True, text=True)
    assert deploy_process.returncode == 0
    assert deploy_process.stderr == ""
    assert out_message in deploy_process.stdout

def clean():
    print("Cleaning the old SDK.")
    subprocess.run(['rm', '-rf', 'sdk'])
