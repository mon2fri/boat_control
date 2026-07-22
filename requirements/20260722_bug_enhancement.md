B1. in the upload page, the grouping column dropdown box is showing all columns instead columns selected in "COLUMN FILTER"
B2. in the result page, the grouping statistics is only showing Total and Null, however, I can see grouping columns are having different values from filter dropdown.

E1. optimize uploaded files, everytime user submit csv, after inspect header and while user is picking header, perform compare on uploaded files and stored files in /data/uploads
    - if same file,per content not filename, exists, don't have to upload, but pointing to the existing file, otherwise, upload and keep a copy of the file.
    - create a link between reports and underlying files, if no more report is pointing at the underlying files, remove those underlying files automatically.
    - at application start up, check if orphan underlying files without linked with any report, also remove the underlying files.
