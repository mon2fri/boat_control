Hit below error message when loading real CSV files,

1. during the upload page, the column inspection is taking long time, suspect it is reading two whole csv file.
   - in the upload page, only need to read the first line, the header, and make header check on that, perhaps using readline, avoid loading the whole file. 
   - When user pick needed columns, only read named columns.
   Design Question: whether such arrangement reduce process time/user wait time?
2. All value from CSV should be treated as String other than anything else.
```E 121/Jul/2026 13:06:14] "GET /api/rules/ Untitled-1 •
[21/Jul/2026 13:06:14] "GET /api/rules/ HTTP/1.1* 200 24
Internal Server Error: /api/files/filters/prepare/ Traceback (most recent call last):
File "C: \Users\45303819\Documents \python_interpreters\3.12\raid_boatctr1\Lib\site-packages\django\core\handlers\exception.py", line 55, in inner response get_response(request)
File "C: \Users \45303819 \Documents \python_interpreters\3.12\raid_boatctr1\Lib\site-packages\dijango\core\handlers\base.py", line 198, in _get_response
response = wrapped_callback(request, *callback args, **callback kwangs)
File "C: \Users\45303819\Documents \python_interpreters\3.12\raid_boatctrl\Lib\site-packages\django\views\decorators\csrf-py", line 65, in _view wrapper return view func(request, *args,
**kwargs)
٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨
File "C: \Users\45303819\Documents \python_interpreters\3.12\raid_boatctrl\Lib\site-packages\django\views\generic\base-py", line 186, in view return self.dispatch(request, *args, **kwargs)
ЛАЛАЛАЛАЛЛАЛАЛЛАЛЛАЛАЛАЛАЛАЛААЛАЛАЛАЛЛ
File "C: Wsers\45303819\Documents \python_interpreters\3.12\raid_boatctrl\Lib\site-packages\rest_framework\views-py", line 515, in dispatch
response = self. handle_exception(exc)
File "C: \Users\45303819\Documents \python_interpreters\3.12 \raid_boatctrl\Lib\site-packages \rest_framework\views.py", line 475, in handle_exception self. raise_uncaught_exception(exc)
File "C: \Users\45303819\Documents\python_interpreters\3.12\raid_boatctri\Lib\site-packages\rest_framework\views.py", line 486,
in raise_uncaught_exception
raise exc
File "C: \Users\45303819\Documents \python_interpreters\3.12\raid_boatctrl\Lib\site-packages\rest_framework\views.py", line 512,
in dispatch
response = handler(request, *args,
**kwargs)
ДАЛААЛЛАЛЛЛЛ/
File "C: \Users\45303819\OneDrive
-HSBC\01_codings \raid_boatctrl\backend\apps\files\filter_views.py", line 39, in post
result = prepare_filters(patha, path_b, common columns)
File C: \Users \45303819\OneDrive
- HSBC\01_codings \raid_boatctrl\backend \apps\files\filter_services.py", line 68, in prepare filters
row_count_a= pl.scan_csv(path_a).collect().height
٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٩٩٩٩٩٩
File "C: \Users\45303819\Documents\python_interpreters\3.12\raid_boatctrl\Lib\site-packages\polars\_utils\deprecation.py", line 97, in wrapper return function(*args, **kwargs)
٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨
File "C: \Users\45303819\Documents\python_interpreters\3.12\raid_boatctri\Lib\site-packages\polars\lazyframe\opt_flags.py", line 344, in wrapper return function(*angs,
*kwargs)
٨٨٨٨٨٨٨٨A٨٨A٨٨٨٨٨٨٨٨٥
File "C: \Users\45303819\Documents \python_interpreters\3.12\raid_boatctr1\Lib\site-packages\polars\lazyframe\frame.py", Line 2630, in collect return wrap_df(Idf.collect(engine, callback))
polars.exceptions.Computerror: could not parse MDBA01061046 as type 164 at column COST_CENTRE (column number 29)
The current offset in the file is 1029 bytes.
45
You might want to try:increasing "infer_schema_length (e.g- "infer_schema_length-10089*),
﻿﻿specifying correct type with the schema_overrides argument
﻿﻿setting ignore errors to True"
﻿﻿adding ^MDBA01061046" to the "null values list.
Original error: " invalid primitive value found during CSV parsing
[21/Jul/2026 13:06:14] "POST /api/files/filters/prepare/ HTTP/1.1" 500 21774
Traceback (most recent call last):
File "C:\Users\45303819\OneDrive - HSBC\01_codings\naid_boatctrl\trigger-py", line 115, in ‹module> sys.exit(main())
٨٨٨٨٨٨
File "C: \Users\45303819\OneDrive - HSBC\01_codings\raid_boatctrl\trigger-py", line 110, in main
completed = subprocess.run(command, cwd-PROJECT_DIR)
٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨
File "C: \Program Files\Python3.12.7\Lib\subprocess.py", line 550, in run stout, stderr - process. communicate(input, timeout-timeout)
NAAAARAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
to 50, in run
File "C:\Program Files \Python3.12.7\Lib\subprocess.py", line 1201, in communicate self.wait()
File "C:\Program Files\Python3.12.7\Lib\subprocess.py", line 1264, in wait
return self._wait(timeout-Eimeout)
A٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨٨
File "C: \Program Files\Python3.12.7\Lib\subprocess.py", line 1590, in _wait result - _winapi.WaitForSingleObject(self._handle,```