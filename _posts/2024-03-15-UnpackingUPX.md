---
layout: post
title: Unpacking UPX
---

## High level Overview of Steps to Unpack UPX dynamically
1. Find the original entry point of the packed file
1. Run Scylla to extract the payload out
1. Turn on the IMAGE\_FILE\_RELOCS\_STRIPPED flag inside the extracted PE file

### Finding OEP

There are a lot of different ways you can go about doing this, and it would depend heaviy on the packer used and the complexity of it. For a simple hello world program that was packed using UPX the following was the easiest way in which I could find the OEP.
1. Break at the entry point
1. Observe that the instruction at the entry point is a push instruction. Step over that instruction
1. Set a memory breakpoint that will get triggered on accessing the location to which esp/rsp is pointing
1. Run the program until the memory breakpoint is hit. This would likely be after a pop instruction (this would be the counterpart to the initial push instruction)
1. Observe the dissassembly to find a jump instruction in the next few lines. The jump address is likely to be the OEP
1. If you allow the program to jump to the OEP, you can observe the pattern of instructions to see that it resembles a new PE executable. If you are doing this as an exercise you would likely have the original unpacked file. You could compare the bytes of the original executable against the bytes at the OEP to confirm your strategy 


### Running Scylla

Running scylla is fairly well documented. If it is run as a plugin of a debugger, the module start address, size and such would already be filled. All you would need to modify would be the OEP. With the right OEP Scylla should be able to get the right import table. There might be unkown chunks in the imports that scylla had obtained. For a hello world program removing the unknown chunk was enough to get it working. More complicated programs might require more steps to resolve the imports. Dump the payload using Scylla and fix the Import Table using the Rebuild function of Scylla.

### Patching the PE file

After all of this, even though the Scylla dumped file was very similar to the original payload it was crashing on execution. To fix this, open a PE editing tool such as PEBear, or CFF Explorer and turn on the IMAGE\_FILE\_RELOCS\_STRIPPED flag.

