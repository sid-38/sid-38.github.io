---
layout: post
title: Offensive Zoe - AntiVirus vs Adversarial Attacks
---

This semester, I took a special topics course called "ML Based CyberDefenses" under [Dr.Botacin](https://github.com/marcusbotacin). The reason why I took the course was probably because of the description that was given for the course. From what I remember, the course went over how to build malware detection systems using machine learning and over adversarial attacks against such machine learning models. More importantly, the course did not have a final examination but instead had an in-class competition emulating the "Machine Learning Security Evasion Competition" hosted by MLSec.

Luckily the description turned out not to be a clickbait, but instead offered me probably the most hands-on course I've done till now on CyberSecurity. The majority of the class went over students' taking seminars over recent papers in the domain, which was later followed by an even longer discussion about the seminar (which sometimes went into tangents into different topics in CyberSec). The competition had us building machine learning models trained to detect malware through static analysis, as well as modifying malware files to make it evasive to our classmates' detection systems. The result of the competition depended on how well your detection performed against the adversarial attacks it faces, and on how well your adversarial malware samples performed against other team's models. So we prepared for the competition with my teammates, SidBav (https://github.com/sidbav), Soumya (https://github.com/Soumyajyotidutta) and Veronika (https://github.com/vmaragulova3)

## Defend

For the defensive part, the basic strategy was a trial and error through differnt ML Models. For the dataset, we went for the EmberDataset(https://github.com/elastic/ember) for the basic layer with a plan to add on to it with more recent data or data that is tailored for the competition. Ember has its own feature extractor that was throwing some errors when we tried to get it up and running. We debugged through the error to find that due to updates in LIEF library(https://github.com/lief-project), a library that can be used to read and modify executable files, a certain attribute was not in the format that Ember Feature Extractor was expecting. If I remember correctly, it was the 'entry' attribute that needed to be enclosed in an extra pair of square brackets. Ember by default uses a LightGBM model and that's what we went ahead with for the basic version. Later we switched to a Random Forest Classifier model and submitted that for the first delivarable. 

After this blind submission, the professor released the samples he was testing our model against. In order to meet some criteria the competition had regarding False Positive Rate and False Negative Rate, we adjusted the threshold. We tried going down the route of a different feature extractor, in this case, we tried the extractor that our professor had built for his competition. The extractor chose a subset of the attributes available through the PE File Format and then blew it up into a 200,000 feature space. Sadly, all our laptops crashed under this heavy load and we couldn't get the university systems to work for us in theduration of the competition. So we gave up on that idea and went back to the Ember Feature Extractor.

The next idea was to add on to our dataabase. And instead of blindly trying out different datasets, we decided to target datasets. For this purpose we created a "Vocabulary Extractor" script, that basically walks through directories of PE files and creates a set (vocabulary) of the strings it sees. This could be the import functions, the exports functions, the datadirectories, entrypoint etc. 

Here's a preview of the vocabulary we created out of the test samples

imports->USER32.dll->GetDC

datadirectories->name->CERTIFICATE_TABLE

imports->KERNEL32.dll->CreateSemaphoreA

imports->KERNEL32.dll->IsBadStringPtrA

imports->KERNEL32.dll->WriteFile

imports->KERNEL32.dll->EndUpdateResourceW

imports->KERNEL32.dll->GetProcessPriorityBoost

imports->KERNEL32.dll->WideCharToMultiByte

imports->KERNEL32.dll->EnterCriticalSection

header->optional->subsystem->WINDOWS_GUI

We also created a vocabulary from the ember dataset that our model was training on. Using another script called (Vocabulary Comparer), we found the difference between these vocabularies to figure out where our model was lacking. The strategy once we found these "missing" words was to write a script that downloads malware files from the internet, extracts the vocabulary of the file and then compares it with the "missing words" to decide whether to keep the file or not. However, due to lack of time we were not able to build this script and hence had to go back to trial-and-erroring through different dataset.

Here's another issue we came up against when we were trying to train our models. The dataset was getting too big to be contained and processed on in the RAM. More specifically, we had multiple datasets that should be combined into one training set which was then meant to be fed into the model as input. However just combining it all together was eating through my RAM and causing my computer to crash. So we had to figure out a better way. This is where numpy's memmap came into the picture. With this function, we were able to do the combining process on disk without loading it into memory. 

After a couple of all-nighters or near all-nighters, we came up with a couple of differnet models that were honestly not performing good enough. We tried a combination of differnet models in a pipeline approach and finally got to a model that was performing comparitively better than others: Random Forest with 100 estimators trained on Ember2018 dataset, and a Random Forest with 300 estimators trained on Ember2018, Benign-NET and Bodmas all of which uses the PE format attributes to detect malware. 

## Attack 

For the attack part, we parallely started testing out how appending random strings and benign strings would influence the detection, as well as getting a dropper working. So our professor, had built a dropper for this purpose that we decided to base our work on. The dropper takes in the malware file as a payload in its resources and then when executed, writes (drops) the payload into the disk and executes it. The dropper itself was made to emulate a calculator PE file. The beauty of the dropper is that it entirely changes the PE file attributes into the attributes of this enclosing dropper application while the real payload, and all its attributes are enclosed as a resource.

After spending time getting used to the compilation process for PE Files (we used the MSVC toolset so that we can automate the process easily), and a couple of debugging sessions we got the dropper up and running. With this dropper we came up with a strategy of using steganography to further improve our evasiveness. So while the professor embeds the entire payload as a resource, we planned to hide the payload inside a regular image. Every 1 byte out of 8 bytes used in the picture would be containing the malware data. The plan was to use this image (that contained the payload) as an icon resource for our dropper. Pretty soon, we realized that hiding a payload of 1KB would require an image of 8KB and hence this would break a criteria of the competition (Not more than 5MB increase in size) for most payloads. So, then we decided to forget hiding the malware but just to convert it into an image.

We were able to get this image strategy working using OpenCV initially. However not in time for the first blind submission of attacks, and hence we submitted the basic version of the professor's dropper that we got working. After this submission, we were given access to the other group's models inorder to perform white-box attacks on them. With this OpenCV, the performance of the adversarial samples were kinda inconsistent. For many models, and for many samples, the strategy worked brilliantly while for others it reduced the evasiveness. An even bigger issue was that when we checked the funcionality of the adversarial samples we realized that we broke functionality for all of the fies. This was because the sample required the presence of OpenCV library in the target system for its functioning. A little research into dynamic linking and static linking made us understand the issue we were facing. For the exe file to work without being dependent on having OpenCV on the target system, we would have to statically link it while compiling, and just reading about it showed that it's not completely straightforward. Instead we started looking for other image manipulation libraries that would make our lives easier and we stumbled upon lodepng(https://github.com/lvandeve/lodepng). The whole point of lodepng is its portability. It just had one source file and one header file and could easily be linked to our exe without added complexities. It took me a couple of days to get it working, as the data kept being corrupted after the whole binary->image->binary conversion.

So now that we had the image startegy working, it turned out to be not the magic solution that we were expecting it to be. Like I said it before, it was good for some files and some models, but not for all of them. So, time for a different strategy.

The way the dropper emulates a benign files is that it has a lot of dead functions that would make the sample look benign. We decided to target this approach towards our competitor's models. So the strategy is, to find out benign samples that were targeted with a high confidence by a specific model as goodware. Then using the vocabulary extractor script built during the defender stage, get the imports out. Then add these functions to our dropper dead function set. The idea is to try and emulate a PE file that we know for a fact that the model we are targetting considers to be a goodware. With this strategy we, were actually able to get the evasiveness up by a good margin.

So armed with a couple of different strategies with varying rates of success we analyzed the results. Instead of going for one strategy that works for every situation, we decided to go for choosing the best strategy for a specific malware file, that is, the strategy that beats the most number of models. Using this approach, we further increased our rate of success. Once we reached this level, we started using the appending strings strategy in a random trial-and-error fashion to get some samples over the line to flip the decision of the detection system from malware to goodware.

## Results

Our team came in first place for the attack phase of the competition!
