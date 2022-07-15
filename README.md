# Zoho-CRM-bulk-APIs-for-Mass-Update
Zoho CRM's Bulk API allows us to get, process and update records in a more scalable way without burning a ton of API credits. 

## Problem Statement
We need to process and update tens of thousands of records in CRM. Using CRM's API or Deluge task works fine if you have a small dataset, but it becomes unscalable for a larger set of data (the more the records, the higher the API usage).

## Solution
[Zoho CRM Bulk API](https://www.zoho.com/crm/developer/docs/api/v3/bulk-read/overview.html) allows us to get and update a large set of data in a single API call each, up to 250,000 records per call! We will be using the [Bulk Read API](https://www.zoho.com/crm/developer/docs/api/v3/bulk-read/overview.html) to get the records, and then [Bulk Write API](https://www.zoho.com/crm/developer/docs/api/v3/bulk-write/overview.html) to update.
> **Note:** Zoho Bulk API uses csv. You will be getting, processing and updating records in csv.

Here's a summary of what the script would look like:

```mermaid
graph TD
A[Post the Bulk Read job]
B[Get the job ID]
C[Retrieve the csv file of the job via the job ID]
D[Extract the csv file and get the file content]
E[Initiate the headers for a new csv file <br> <li>This will be used for mass update later<li>Record ID and fields that need updating]
F[Process every record and build the update csv file]
G[Generate & compress the csv file]
H["Send the csv file for<BR>record keeping and review<BR>(optional)"]
I[Upload the compresssed file]
J[Get the file ID from the upload]
K[Run the Bulk Write job with the file ID]

subgraph <B> <B>

X((<B>EXTRACT</B>))
A
B
C
D

end

subgraph <B>  <B>
Y((<B>TRANSFORM</B>))
E
F
G
end

subgraph <B>   <B>
Z((<B>LOAD</b>))
I
J
K
end

X -.-> A --> B --> C --> D -.-> Y -.-> E--> F --> G -.-> H -.-> Z -.-> I --> J --> K
```

## Configuration

### Scopes Needed
- ZohoCRM.bulk.read
- ZohoCRM.bulk.ALL
- ZohoCRM.bulk.CREATE
- ZohoFiles.files.ALL
- ZohoCRM.modules.ALL

### Standalone Functions Needed
Create some standalone functions to be called in the main script.
> **Tip:**  You can call another standalone function from a function in Zoho Deluge by using standalone.<function_name>(parameters if any)

#### delay
Zoho Deluge does not have a native delay function, so we write our own (with some help of an external API). This function used to create a short delay in the main script between posting the bulk read job and retrieving the job content because Zoho takes some time to index the job).
```javascript
sleep = invokeurl
[
	url :"https://httpstat.us/200?sleep=" + waitTimeInSeconds * 1000
	type :GET
	detailed:true
];
return sleep;
````
_Note: Set waitTimeinSeconds as the function parameter (int)_

#### getOrgId
This is basically to get the org ID of your CRM account. If you wish to save 1 API call, you can just hard-code the org ID in the main script and skip this.
```javascript
orgInfo = invokeurl
[
	url :"https://www.zohoapis.com/crm/v2/org"
	type :GET
	connection:"crm"
];
orgId = orgInfo.get("org").get(0).get("zgid");
return orgId;
```

## Example Use Case
For the purpose of this demonstration, we've created an example use case: 
For all Deals created in 2022 that are Closed Won with an Amount that is from $100,000 and above whose related Account's Country is US, we want to:
- Check a custom checkbox field called "High Roller".
- Update a custom single line field called "High Roller Info" with a concatenation of "Deal Name (Account Name) : Amount"


## Script Tutorial
> **Note:** The script infrastructure is ready for use. You can just download the code directly and use it with some configuration by checking parts of the script with ```// *** CONFIG *** ```. But, if you want the explanation of how the script works, continue reading.


### 1. INIT
- Initiate some variables at the beginning.
- indexMap is built to create a mapping of fields and index for easy reference later at the processing stage.

```javascript
// 1. INIT
// *** CONFIG ***
module = "Deals";
// This will be the used as the file name for the csv and zip file (bulkWrite_Demo.csv / bulkWrite_Demo.zip)
bulkJobName = "bulkWrite_Demo";
indexMap = Map();
indexMap.put("id",0);
```

### 2. POST THE BULK READ JOB
- List the required fields that you want to fetch, add them into the indexMap map with a loop.
  - Note: Just like COQL, you can just type ```Lookup_field.field``` to get information of a field on a related record in a lookup field.
- Build the query map.
- State your criteria (optional - if you want to narrow down the records you're getting by criteria).
- Run the bulk read API call.

```javascript
// 2. POST THE BULK READ JOB
header = Map();
header.put("Content-Type","application/json");
// *** CONFIG ***
// List the required fields
fields = List();
fields.add("Deal_Name");
fields.add("Amount");
fields.add("Account_Name.Country");
// Add to Index Map
for each  f in fields
{
	indexMap.put(f,indexMap.keys().size());
}
// Build the query map
query = Map();
query.put("module",module);
query.put("fields",fields);
// *** CONFIG ***
// State the criteria (optional)
group = List();
group.add({"api_name":"Stage","comparator":"equal","value":"Closed Won"});
group.add({"api_name":"Created_Time","comparator":"greater_equal","value":"2022-01-01T00:00:00+05:00"});
group.add({"api_name":"Account_Name.Country","comparator":"equal","value":"US"});
group.add({"api_name":"Amount","comparator":"greater_equal","value":"100000"});
criteria = Map();
criteria.put("group",group);
criteria.put("group_operator","and");
query.put("criteria",criteria);
// Stick into the main map
param = Map();
param.put("query",query);
bulkRead = invokeurl
[
	url :"https://www.zohoapis.com/crm/bulk/v2/read"
	type :POST
	parameters:param.toString()
	headers:header
	connection:"crm"
];
info "bulkRead : " + bulkRead;
```

### 3. GET THE JOB ID
- Get the job ID created by the Bulk Read API call
```javascript
// 3. GET THE JOB ID
if(bulkRead.containKey("data"))
{
	if(bulkRead.get("data").get(0).get("status") == "success")
	{
		jobId = bulkRead.get("data").get(0).get("details").get("id");
	}
}
```

### 4. GET THE CSV FILE BY RETRIEVING THE JOB (this gets you a zip file containing a csv of the result)
> **Note:** The rest of the script from hereon is wrapped in an `if(jobId != null)` condition.
- Create a 10-second delay with the standalone function that you have configured (we have found 10 seconds to be the average time it takes for am average sized bulk read job to be indexed).
  - If you try to retrieve a job before it's indexed, it will fail.
- Run the API call to retrieve the bulk job.
- A job may take longer than 10 seconds to index for larger datasets. To account for that, create a pseudo-while loop to repeat the retrieval API call with a 10-second delay at iteration until successful.
  - Zoho does not have a native function for a while loop, so we make our own with an iterator and if condition. Read more about creating your own while loop [here](https://github.com/camberdynamics/Create-List-Of-Sequential-Numbers).
  - We have set 10 iterations of 10-second delays. Plus the initial 10-second delay, this section could go up to a maximum of 110 seconds to retrieve a job. You can increase the number here, but keep in mind that Zoho Deluge has a runtime limit of 5 minutes per execution.

```javascript
if(jobId != null)
{
	// 4. GET THE CSV FILE BY RETRIEVING THE JOB (this gets you a zip file containing a csv of the result)
	standalone.delay(10);
	zipFile = invokeurl
	[
		url :"https://www.zohoapis.com/crm/bulk/v2/read/" + jobId + "/result"
		type :GET
		connection:"crm"
	];
	info "zipFile : " + zipFile;
	// Create a while loop with delay to repeat the job until it passes
	iterator = repeat(",",10);
	n = 0;
	for each i in iterator
	{
		if (!zipFile.isFile())
		{
			n = n + 1;
			standalone.delay(10);
			// REPEAT THE GET CSV FILE JOB
			zipFile = invokeurl
			[
				url :"https://www.zohoapis.com/crm/bulk/v2/read/" + jobId + "/result"
				type :GET
				connection:"crm"
			];
			info "no. of extra runs : " + n; 
			info "zipFile : " + zipFile;	
		}
	}	
```

### 5. EXTRACT THE CSV FILE
- Once the bulk is successfully retrieved, you will be returned with a .zip file.
- Extract the zip file and you will get a .csv file.
```javascript
	// 5. EXTRACT THE CSV FILE
	csvFile = zipFile.extract();
	csvFile = csvFile.values();
	csvFile = csvFile.get(0);
```

### 6. GET THE FILE CONTENT
- In order to process the records fetched in Deluge, we need to access the contents of the csv file.
- This is done by getting the file content and converting it to a list with a line break delimiter.
```javascript
	// 6. GET THE FILE CONTENT
	content = csvFile.getFileContent();
	content = content.toString().toList("\n");
```


### 7. INITIATE THE HEADERS AND A LIST TO CREATE THE UPDATE CSV
- Before you start iterating over every record to process your data, initiate a list to create a new csv file for the update
- Here's where you also intiate the headers for the update csv. The columns would be the record ID and the fields that you want to update.
- In this example, we want to iterate over Deals that are above $100,000 and update the "High_Roller" checkbox field. So we only need 2 columns - id and > **Note:** The field names have to be API names.
```javascript
	// 7. INITIATE THE LIST FOR CSV AND HEADER
	// *** CONFIG ***
	// Specify the header rows in the list below
	csvHeaders = {"id","High_Roller","High_Roller_Info"};
	newLine = "";
	for each  c in csvHeaders
	{
		newLine = newLine + "\"" + c + "\",";
	}
	newLine = newLine.removeLastOccurence(",");
	csvRows = List();
	csvRows.add(newLine);
```

### 8. ITERATE OVER EACH ROW AND BUILD THE CSV
- Here's the start of the processing section.
- We get the field value with the indexMap that we have built at the top of the script - `c.get(indexMap.get("field_name")`
- The entire section in the loop here is based on the example use case. Please configure accordingly.
- In this example, we setting "true" to the "High_Roller" field and a concatenation of "Deal Name (Account Name) : Amount".
> **Tip:** The toString() function is more than just converting a variable to a string. It has many uses and one of it is to format an integer into a comma separated currency as seen in the `amount.toString("$#,##0")` part of the script. [Click here to read more about character formatting using toString().](https://github.com/camberdynamics/toString-Character-Formatting)

```javascript
	// 8. ITERATE OVER EACH ROW AND BUILD THE CSV
	for each  c in content
	{
		if(c.get(0).isNumber())
		{
			// *** CONFIG ***
			// This entire section is an example. Please configure accordingly
			// Assign field variable and get the field values with the index map that was built
			id = c.get(indexMap.get("id"));
			dealName = c.get(indexMap.get("Deal_Name"));
			amount = c.get(indexMap.get("Amount"));
			account = c.get(indexMap.get("Account_Name.Account_Name"));
			// Build the High Roller Info string
			hrInfo = dealName + " (" + account + ") : " + amount.toString("$#,##0");
			info hrInfo;
			// Build the csv (Add double-quotes in case the values contains commas)
			newLine = "\"" + id + "\",\"" + true + "\",\"" + hrInfo + "\"";
			csvRows.add(newLine);
		}
	}
```


### 9. GENERATE THE UPDATE CSV FILE
- After the loop, generate the csv file by creating the file name with a ".csv" suffix.
- Then, convert it to string with the line break delimiter and use the `toFile()` function to convert it into a file. 
```javascript
	// 9. GENERATE THE UPDATE CSV FILE
	fileName = bulkJobName + ".csv";
	readyCsv = csvRows.toString("\n").toFile(fileName);
```


### 10. SEND THE UPDATE CSV FILE TO EMAIL FOR RECORD KEEPING AND REVIEW (OPTIONAL)
- This step is optional, but highly recommended.
- You can send the csv file you created to yourself for record keeping and review to make sure that the update values are correct before running the bulk write job to update the fields.
  - If you're doing this in a single CRM Deluge script, you can comment out all the parts of the script after this section and execute the script to get the file, then uncomment them and execute the full script once you have performed your sanity check.
  - If you're building this as an app in Creator, you can make it a two-step process and separate your script into two section:
    - Step 1: User hits a button that runs the bulk read job, process the records and returns the update csv to the user via email (simultaenously, store this file somewhere so you can retrieve it at the second step later).
    - Step 2: Upon reviewing the csv file, the user hits another button that runs the bulk write job to mass update the records
```javascript
	// 10. SEND THE UPDATE CSV FILE TO EMAIL FOR RECORD KEEPING AND REVIEW (OPTIONAL)
	sub = bulkJobName + " Generated at " + now.toString("dd-MMM-yyyy hh:mm:ss a '(PT)'");
	body = "Please find attached the " + bulkJobName + " csv file.";
	// *** CONFIG ***
	devEmail = "jay@camberdynamics.com";
	sendmail
	[
		from :zoho.loginuserid
		to :devEmail
		subject :sub
		message :body
		Attachments :file:readyCsv
	]	
```

### 11. COMPRESS THE UPDATE CSV FILE
- The Bulk Write API requires the file to be in a compressed zip file

```javascript
	// 11. COMPRESS THE UPDATE CSV FILE
	compressedFile = readyCsv.compress(bulkJobName);
	info "compressedFile : " + compressedFile;
```


### 12. UPLOAD THE COMPRESSED FILE
- Use the Bulk Write API to upload the compressed file

```javascript
	// 12. UPLOAD THE COMPRESSED FILE
	param = Map();
	param.put("file",compressedFile);
	header = Map();
	header.put("feature","bulk-write");
	header.put("X-CRM-ORG",standalone.getOrgId());
	upload = invokeurl
	[
		url :"https://content.zohoapis.com/crm/v2/upload"
		type :POST
		parameters:param
		headers:header
		connection:"crm"
		content-type:"multipart/form-data"
	];
	info "upload : " + upload;
```



### 13. GET FILE ID FROM THE UPLOAD & RUN THE BULK WRITE
- Finally, get the file ID from the upload API call and run the bulk write API to mass update all the records

```javascript	
	// 13. GET FILE ID FROM THE UPLOAD & RUN THE BULK WRITE
	if(upload.get("code") == "FILE_UPLOAD_SUCCESS")
	{
		fileId = upload.get("details").get("file_id");
		
		// 15. BULK WRITE
		param = Map();
		param.put("operation","update");
		fieldMappings = List();
		for each index c in csvHeaders
		{
			fieldMappings.add({"api_name":csvHeaders.get(c),"index":c});
		}
		resource = Map();
		resource.put("type","data");
		resource.put("module",module);
		resource.put("file_id",fileId);
		resource.put("field_mappings",fieldMappings);
		resource.put("find_by","id");
		param.put("resource",{resource});
		header = Map();
		header.put("Content-Type","application/json");
		bulkWrite = invokeurl
		[
			url :"https://www.zohoapis.com/crm/bulk/v2/write"
			type :POST
			parameters:param.toString()
			headers:header
			connection:"crm"
		];
		info "bulkWrite : " + bulkWrite;
	}
}
```
A successful bulk write job will return a response that looks like this:

```
{
  "status": "success",
  "code": "SUCCESS",
  "message": "success",
  "details": {
    "id": "4371574000016498003",
    "created_by": {
      "id": "4371574000000251013",
      "name": "Mike Copters"
    }
  }
}
```
