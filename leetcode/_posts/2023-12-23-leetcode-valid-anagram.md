---
layout: post
title: Valid Anagram
---

Given two strings s and t, return true if t is an anagram of s, and false otherwise.

An Anagram is a word or phrase formed by rearranging the letters of a different word or phrase, typically using all the original letters exactly once.

Example 1:

Input: s = "anagram", t = "nagaram"
Output: true

Example 2:

Input: s = "rat", t = "car"
Output: false
 

Constraints:

* 1 <= s.length, t.length <= 5 * 104
* s and t consist of lowercase English letters.

[Link to Problem](https://leetcode.com/problems/valid-anagram/description/)

## Solution 1

```c++
class Solution {
public:
    bool isAnagram(string s, string t) {
        unordered_map<char, int> occurs;
        for(char c: s){
            if(occurs.find(c) == occurs.end())
                occurs[c] = 1;
            else
                occurs[c]++;
        }

        for(char c: t){
            if(occurs.find(c) == occurs.end())
                return false;
            else
                occurs[c]--;
        }

        for(auto itr: occurs){
            if(itr.second != 0)
                return false;
        }
        return true;
    }
};
```

Time Complexity - O(n)

## Solution 2
Works for only lowercase english alphabets
```c++
class Solution {
public:
    bool isAnagram(string s, string t) {
        int count[26] = {0};
        for(char c: s){
            cout << int(c);
            count[int(c)-97]++;
        }

        for(char c: t){
            count[int(c)-97]--;
        }

        for(int itr: count){
            if(itr != 0)
                return false;
        }
        return true;
    }
};
```

Time Complexity - O(n)
