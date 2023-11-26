---
layout: post
title: Learning Awk!
---

On a path to understand the widely famed power of Awk. Hope to conquer it one day, just for the sake of it. Sed is the next one on the bucket list

## Most basic use case

Say you want to print out the second word from each line.

```bash
awk '{print $2}' input_file
```

Awk follows a \<pattern\> \<action\> format. For each line, awk will apply the pattern and see if it matches. If it does match, it'll perform the action. Now, you can omit either pattern or action but atleast one should be present. If action is omitted, the default action is to just print the line out. If pattern is omitted, the action would be applied to all the lines. 

In the above example of printing out the second word, there is no pattern but only action. $1 corresponds to the first word, $2 to the second and so on. $0 corresponds to the whole line.


```bash
awk '/^A/ {print $2}' input_file
```
This is similar to printing out the second word, but instead of in each lines it just prints it out on the lines that starts with the letter A. The regex pattern in the awk command enclosed within the slashes acts as the pattern to be matched against.

Awk can handle a whole set of pattern action tuples instead of just one. So if you write out

```bash
awk '<pattern> <action>
     <pattern> <action>
     <pattern> <action>' input_file
```
for each line in the file, all patterns would be matched up one after the other. If a pattern matches, its correpsonding action would be performed on the line. 

## Variables makes it awesome!

You can use variables inside the awk command, making it a whole programming language capable of performing complex logic. There are variables you can define and there are some in-built variables as well. 

Let's say you want to print out the second word of the second line that starts with the letter A.
```bash
awk '/^A/ {n++; if(n==2) print $2;}' input_file
```
A couple of things about the above command. First thing that's worth noticing is that you can concatenate multiple commands inside the action part of awk. They'll be executed one after the other just like a normal programming language. Another thing is that you can just start using a variable and it'll be initialized to 0 by default. So the first time awk encounters a line starting with A, it'll initialize the variable n with the value 0, increment it and then check it against the if condition. The second time the pattern matches, the value of n will increment from 1 to 2, which makes the if condition true causing it to print the second word of that line.

*Still under construction. More to come...*
