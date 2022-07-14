# Zoho-CRM-bulk-APIs-for-Mass-Update
Zoho CRM's Bulk API allows us to get, process and update records in a more scalable way without burning a ton of API credits. 

## Problem Statement
We need to process and update tens of thousands of records in CRM. Using CRM's API or Deluge task works fine if you have a small dataset, but it becomes unscalable for larger set of data (the larger the dataset, the higher the API usage).

## Solution
Zoho CRM Bulk API allows us to get and update a large set of data in a single API call each, up to 250,000 records per call! We will be using the Bulk Read API the records, and then a Bulk Write API for update.


