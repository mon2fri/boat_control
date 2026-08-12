This enhancement focus on the data loading process from page 2, after user uploads the two file.

1. The data loading cache has been presistenced into hard drive, and reusable from the same session. However, if user uploaded the same pair of files. Another session should be able to take advantage of the previous cache.
2. Currently the progress bar only measures column processed, but there still a long period that user seeing 99%. To adjust user's expectation, the progree bar should be mapped against 5 minute process time.
   - it is confident that data loading can be finished within 5 minutes in most cases.
3. decouple the IO time, once all data is ready, writing of cache file should be a backend job instead of blocking user's action.
