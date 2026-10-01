# Synthetic stdin TTY for the child CLI; stdout and stderr remain separate pipes.
import json
import os
import pty
import subprocess
import sys

master, slave = pty.openpty()
try:
    child = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    os.close(slave)
    slave = None
    os.write(master, "Synthetic travel mood\n".encode("utf-8"))
    stdout, stderr = child.communicate(timeout=8)
    print(json.dumps({"status": child.returncode, "stdout": stdout.decode("utf-8"), "stderr": stderr.decode("utf-8")}))
finally:
    os.close(master)
    if slave is not None:
        os.close(slave)
