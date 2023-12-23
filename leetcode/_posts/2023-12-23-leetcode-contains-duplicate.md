---
layout: post
title: Contains Duplicate
---

Given an integer array nums, return true if any value appears at least twice in the array, and return false if every element is distinct.

## Solution

```c++
{
    class Solution {
    public:
        bool containsDuplicate(vector<int>& nums) {
          std::unordered_set<int> nums_set;
          for(int num: nums)  {
              if(nums_set.contains(num))
                return true;
              nums_set.insert(num);
          }
          return false;
        }
    };
}
```

Time Complexity - O(nlogn)

```c++
{
    class Solution {
    public:
        bool containsDuplicate(vector<int>& nums) {
          sort(nums.begin(), nums.end());
          for(int i=0; i<nums.size(); i++){
            if(i < nums.size()-1 && nums[i] == nums[i+1])
                return true;
          }
          return false;
        }
    };
}
```

Time Complexity - O(nlogn)
