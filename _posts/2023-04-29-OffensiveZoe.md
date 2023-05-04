---
layout: post
title: OffensiveZoe - AntiVirus vs Adversarial Attacks
---

For the course "ML Based CyberDefenses" under [Dr.Botacin](https://github.com/marcusbotacin) we had a very interesting and hands-on in-class competition. You form teams, and then each team come up with a malware detection system as well as generate some adversarial samples (samples that are designed to evade the ML detection models) using existing malware files. The adversarial samples that our "competitors" came up with would be put against our detection system, and vice versa to decide how much points each team scores. Luckily, I was able to find a team that valued team-building as importantly as actual work leading to a lot of fun memories. Big Shout out to [SidBav](https://github.com/sidbav), [Soumya](https://github.com/Soumyajyotidutta) and [Veronika](https://github.com/vmaragulova3). And to Zoe our team-mascot (Not to brag, but I won her from a claw machine first try)

![Zoe - Our Team Mascot](/images/zoe.png)

## Defend

### Initial Dataset and Feature Extractor

For the defensive part, the basic strategy was a trial and error through different ML Models. For the dataset, we went for the [EmberDataset](https://github.com/elastic/ember) for the basic layer with a plan to add on to it with more recent data or data that is tailored for the competition. Ember has its own feature extractor that was throwing some errors when we tried to get it up and running. We debugged through the error to find that due to updates in [LIEF library](https://github.com/lief-project), a library that can be used to read and modify executable files, a certain attribute was not in the format that Ember Feature Extractor was expecting. If I remember correctly, it was the 'entry' attribute that needed to be enclosed in an extra pair of square brackets. Ember by default uses a LightGBM model and that's what we went ahead with for the basic version. Later we switched to a Random Forest Classifier model and submitted that for the first deliverable.  After this blind submission, the professor released the samples he was testing our model against. In order to meet some criteria the competition had regarding False Positive Rate and False Negative Rate, we adjusted the threshold. 

### Different Feature Extractor ?
We tried going down the route of a different feature extractor, in this case, we tried the extractor that our professor had built for his competition. The extractor chose a subset of the attributes available through the PE File Format and then blew it up into a 200,000 feature space. Sadly, all our laptops crashed under this heavy load and we couldn't get the university systems to work for us in the duration of the competition. So we gave up on that idea and went back to the Ember Feature Extractor. For anybody who might be interested and has the resources to run it, [here](https://github.com/fabriciojoc/2021-Machine-Learning-Security-Evasion-Competition) it is.

### Finding more data
The next idea was to add on to our database. And instead of blindly trying out different datasets, we decided to target datasets. For this purpose we created a [Vocabulary Extractor](https://github.com/sidbav/AV-vs-Evasive/tree/testing-attacks/scripts/vocabulary_extractor) script, that basically walks through directories of PE files and creates a set (vocabulary) of the strings it sees. This could be the import functions, the exports functions, the datadirectories, entrypoint etc. 

Here's a preview of the vocabulary we created out of the test samples

{% highlight text %}
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
{% endhighlight %}

We also created a vocabulary from the ember dataset that our model was training on. Using another script called [Vocabulary Comparer](https://github.com/sidbav/AV-vs-Evasive/tree/testing-attacks/scripts/vocab_comparer), we found the difference between these vocabularies to figure out where our model was lacking. The strategy once we found these "missing" words was to write a script that downloads malware files from the internet, extracts the vocabulary of the file and then compares it with the "missing words" to decide whether to keep the file or not. However, due to lack of time we were not able to build this script and hence had to go back to trial-and-erroring through different dataset.

### Avoiding dataset operations on RAM
Here's another issue we came up against when we were trying to train our models. The dataset was getting too big to be contained and processed on in the RAM. More specifically, we had multiple datasets that should be combined into one training set which was then meant to be fed into the model as input. However just combining it all together was eating through my RAM and causing my computer to crash. So we had to figure out a better way. This is where numpy's memmap came into the picture. With this function, we were able to do the combining process on disk without loading it into memory. 

### Final Model
After a couple of all-nighters or near all-nighters, we came up with a couple of different models that were honestly not performing good enough. We tried a combination of different models in a pipeline approach and finally got to a model that was performing comparatively better than others: Random Forest with 100 estimators(named Zoe) trained on Ember2018 dataset, and a Random Forest with 300 estimators (named Mike from Monsters Inc.) trained on Ember2018, Benign-NET and Bodmas all of which uses the PE format attributes to detect malware. [Here's](https://hub.docker.com/repository/docker/sidbav/689-final-submission/general) the docker image for our model.

## Attack 

For the attack part, we parallely started testing out how appending random strings and benign strings would influence the detection, as well as getting a dropper working. 

### Dropper
So our professor, had built a [dropper](https://github.com/marcusbotacin/Dropper) for this purpose that we decided to base our work on. The dropper takes in the malware file as a payload in its resources and then when executed, writes (drops) the payload into the disk and executes it. The dropper itself was made to emulate a calculator PE file. The beauty of the dropper is that it entirely changes the PE file attributes into the attributes of this enclosing dropper application while the real payload, and all its attributes are enclosed as a resource.

### Packers
We also tried out a lot of packers (some were very sketchy). While some of them did increase the evasiveness, it was not enough to get the detection systems to change their decisions. Moreover, the well known packers made the detection systems become more suspicious of our samples, making it a counter-productive strategy.

### Steganography?
After spending time getting used to the compilation process for PE Files (we used the MSVC toolset so that we can automate the process easily), and a couple of debugging sessions we got the dropper up and running. With this dropper we came up with a strategy of using steganography to further improve our evasiveness. So while the professor embeds the entire payload as a resource, we planned to hide the payload inside a regular image. Every 1 byte out of 8 bytes used in the picture would be containing the malware data. The plan was to use this image (that contained the payload) as an icon resource for our dropper. Pretty soon, we realized that hiding a payload of 1KB would require an image of 8KB and hence this would break a criteria of the competition (Not more than 5MB increase in size) for most payloads. So, then we decided to forget hiding the malware but just to convert it into an image.

### Image Conversion
We were able to get this image strategy working using OpenCV initially. However not in time for the first blind submission of attacks, and hence we submitted the basic version of the professor's dropper that we got working. After this submission, we were given access to the other group's models inorder to perform white-box attacks on them. With this OpenCV, the performance of the adversarial samples were kinda inconsistent. For many models, and for many samples, the strategy worked brilliantly while for others it reduced the evasiveness. An even bigger issue was that when we checked the funcionality of the adversarial samples we realized that we broke functionality for all of the fies. This was because the sample required the presence of OpenCV library in the target system for its functioning. A little research into dynamic linking and static linking made us understand the issue we were facing. For the exe file to work without being dependent on having OpenCV on the target system, we would have to statically link it while compiling, and just reading about it showed that it's not completely straightforward. Instead we started looking for other image manipulation libraries that would make our lives easier and we stumbled upon [lodepng](https://github.com/lvandeve/lodepng). The whole point of lodepng is its portability. It just had one source file and one header file and could easily be linked to our exe without added complexities. It took me a couple of days to get it working, as the data kept being corrupted after the whole binary->image->binary conversion.

So now that we had the image startegy working, it turned out to be not the magic solution that we were expecting it to be. Like I said it before, it was good for some files and some models, but not for all of them. So, time for a different strategy.

The way the dropper emulates a benign files is that it has a lot of dead functions that would make the sample look benign. We decided to target this approach towards our competitor's models. So the strategy is, to find out benign samples that were targeted with a high confidence by a specific model as goodware. Then using the vocabulary extractor script built during the defender stage, get the imports out. Then add these functions to our dropper dead function set. The idea is to try and emulate a PE file that we know for a fact that the model we are targeting considers to be a goodware. With this strategy we, were actually able to get the evasiveness up by a good margin.

In the meanwhile, since we had access to the other teams' detection systems (docker images), we were also able to make them print out the confidence scores with which they base their decisions on. This would help us observe with finer details, how each strategy and each change affects each model. To know how we managed to modify the docker images to get to the model details, check out the [blog post](https://github.com/marcusbotacin/Dropper) by my friend, Sidharth Baveja. 

So armed with a couple of different strategies with varying rates of success we analyzed the results. Instead of going for one strategy that works for every situation, we decided to go for choosing the best strategy for a specific malware file, that is, the strategy that beats the most number of models. Using this approach, we further increased our rate of success. Once we reached this level, we started using the appending strings strategy in a random trial-and-error fashion (Hail Mary) to get some samples over the line to flip the decision of the detection system from malware to goodware.

## Results

Our team came in first place for the attack phase of the competition!

Link for the project repository [here](https://github.com/sidbav/AV-vs-Evasive)
