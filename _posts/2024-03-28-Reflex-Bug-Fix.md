---
layout: post
title: Investigating a bug in Reflex
---

For the last 4-5 days, I’ve been spending a large amount of time investigating a bug and figuring out its fix. This meant, diving into rabbit holes, going deeper and deeper and surrounding myself with documentation and online discussion forums. I’m briefly outlining the process here mostly because I’m pretty proud of what I did.

[Link to the Github Issue](https://github.com/reflex-dev/reflex/issues/2335)

So I was going through the open source repository of the Python web framework Reflex and I saw that they had an issue that was preventing them from using Reflex in Windows systems with Python 3.12. The issue was that whenever they were using Reflex in this environment and they leveraged the hot reload feature of the tool, the frontend server just dies. In other words, when you make a change in one of the files, you expect the running servers to detect it and reload the website with the new changes. You can see in the logs that the change has indeed been detected and they have compiled the new version of the website but for some reason the frontend server is not alive anymore. An early clue that I caught was that the logs were showing the character combination ‘[?025h’ whenever this was happening. I had also noticed that whenever I stopped Reflex intentionally with a Ctrl+C,  this character combination was getting outputted as well. So the first thought was, okay somehow a Ctrl+C from somewhere was affecting the frontend server.

The developer had mentioned in the issue discussion that the bug is connected to one of their upstream dependency ‘uvicorn’. Uvicorn is an ASGI web server in Python and Reflex uses Uvicorn as their backend server in development mode. Uvicorn has a reload functionality that detects the changes in the server directory and updates the server accordingly. I tested out the uvicorn server on its own and the reload functionality was working perfectly. The next thing I did was go through the reflex code and see how they were using the uvicorn server inside it. I also studied how they were spawning the frontend server as well. With this information, I created a very small mock reflex, that was using uvciorn server and a mock frontend server (a while loop printing the word “Frontend”) just the way the original reflex implemented it. In short, the frontend server was initiated as a python subprocess and the uvicorn server ran in the main thread. This mock version took away a lot of the complexities and reduced it down to simple elements so that I can zone in on where the issue is. And sure enough, when I ran it, a reload of the uvicorn server killed my mock frontend.

```python
# main.py

import subprocess
import uvicorn

process = subprocess.Popen(["python", "frontend.py"], shell=True)

print("Starting uvicorn")
uvicorn.run(
    app="uvicorn_main:app",
    port=5000,
    log_level="debug",
    reload=True)
```

```python
# frontend.py

import time

if __name__ == "__main__":
    while True:
        print("frontend")
        time.sleep(5)
```

```python
# uvicorn_main.py

async def app(scope, receive, send):
    assert scope['type'] == 'http'

    await send({
        'type': 'http.response.start',
        'status': 200,
        'headers': [
            [b'content-type', b'text/plain'],
        ],
    })
    await send({
        'type': 'http.response.body',
        'body': b'Hello, world!',
    })
```

[Link to the Uvicorn Discussion](https://github.com/encode/uvicorn/discussions/2292)

At this point, I had started using a Process Explorer to see the process hierarchy in order to try and figure out how a reload process in the main thread could affect a subprocess. I also started studying the code in uvicorn to see how they carried out their reload process. I noticed that on detecting file changes they kill their server process (a child process in the hierarchy) and they start it over again. And an even more interesting bit was that they were using a CTRL\_C\_EVENT signal to close the server. Since I was on the lookout for Ctrl+C from the beginning, I started tracing out the changes to this piece of code through their changelog. I noticed that earlier they were using a Process.terminate() function and they changed it to the Ctrl+C event a couple of versions back. This again corroborated our issue as I noticed that Python 3.11 was using a uvicorn version before this change whereas Python 3.12 was using the one after.

Now, I was getting pretty sure that it is this line of code that was affecting my frontend server and I did a couple of tests to confirm that all the versions before this change were working perfectly. Now the question was, why would uvicorn sending a Ctrl+C to one of its child affect a subprocess that was initiated by its ancestor. That made absolutely no sense to me. So I went into more deep dives on the Ctrl+C event.

After a lot of internet searches, I reached these two links
1. <https://bugs.python.org/issue42962>
2. <https://github.com/microsoft/terminal/issues/335>

Turns out, in windows when you’re sending Ctrl+C events using the os.kill function, it is meant to be sent to process groups and not individual processes. If you do send it to an individual process, it just defaults to the root process group (which is the console that started reflex) and hence all its children. That solves the mystery of how uvicorn was managing to reach the frontend subprocess.

Now that I know the reason behind the bug, how do I fix this? Getting uvicorn to fix this bug was one option, but that would probably take time and in the meanwhile Reflex could use a workaround. Back to more rabbit holes.

As I was going through the Python subprocess documentation, I saw that they had a creationflags parameter that took in an attribute CREATE\_NEW\_PROCESS\_GROUP. That leads me to the idea, what if I start the frontend subprocess as a new process group? Would the uvicorn Ctrl+C event still reach it? I got down to testing it out, and to my happiness I saw that uvicorn was not able to stop the frontend anymore. And then, to my sadness I saw that I was not able to stop the frontend anymore either. Basically, the hot reload issue was fixed but now when I tried to quit Reflex as a whole with a Ctrl+C, even though uvicorn was exiting properly the frontend was just ignoring me. What’s up with that?

I started going through the documentation for the python subprocess creation flag as well as the CreateProcess windows function that was happening behind the scenes. The story being told by both these parties were slightly different. The Python documentation claims that when you create a subprocess with the CREATE\_NEW\_PROCESS\_GROUP flag, you can send it a Ctrl+C event using the os.kill function. However, the CreateProcess Windows function tells you that one of the first things they do when you create a new process group is that they turn off the Ctrl+C handler for it. Which means the new process group does not respond Ctrl+C signals anymore. At this point I’m very confused about how this whole Ctrl + C event and process groups were intended to be in the first place. I did test this information out with my Mock Reflex and it checked out. The Ctrl+C handler was indeed turned off for the new process group and that was the reason why uvicorn’s buggy Ctrl+C was not affecting the frontend. Because the frontend, does not see Ctrl+C at all anymore. 

So what do I do with this? Well, maybe the frontend does not respond to Ctrl+C anymore, but it does respond to other signals such as Ctrl+Break event and SIGTERM. After discussions with the developers of Reflex, we decided that as a workaround once uvicorn exits Reflex will send a SIGTERM to the frontend.

That brings me to the end of my long drawn out investigation on understanding a bug and providing a solution for it. The deeper you go into the rabbit hole the more tangled you get in the details, but the satisfaction of finding answers is very rewarding. 
 

