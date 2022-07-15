// NOTE TO DEVELOPER:
// Create two standalone functions before you begin
// - delay
// - getOrgId
// The following scopes are required
// - ZohoCRM.bulk.read
// - ZohoCRM.bulk.ALL
// - ZohoCRM.bulk.CREATE
// - ZohoFiles.files.ALL
// - ZohoCRM.modules.ALL
// Please change "crm" to your connection link name in all instances throughout the script

// 1. INIT
// *** CONFIG ***
module = "Deals";
// This will be the used as the file name for the csv and zip file (bulkWrite_Demo.csv / bulkWrite_Demo.zip)
bulkJobName = "bulkWrite_Demo";
indexMap = Map();
indexMap.put("id",0);

// 2. POST THE BULK READ JOB
header = Map();
header.put("Content-Type","application/json");
// *** CONFIG ***
// List the required fields
fields = List();
fields.add("Deal_Name");
fields.add("Amount");
fields.add("Account_Name.Account_Name");
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

// 3. GET THE JOB ID
if(bulkRead.containKey("data"))
{
	if(bulkRead.get("data").get(0).get("status") == "success")
	{
		jobId = bulkRead.get("data").get(0).get("details").get("id");
	}
}
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
	// // Create a while loop with delay to repeat the job until it passes
	iterator = repeat(",",10);
	n = 0;
	for each i in iterator
	{
		if (!zipFile.isFile())
		{
			n = n + 1;
			standalone.delay(10);
			// Repeat the get csv file API call
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
	
	// 5. EXTRACT THE CSV FILE
	csvFile = zipFile.extract();
	csvFile = csvFile.values();
	csvFile = csvFile.get(0);
	
	// 6. GET THE FILE CONTENT
	content = csvFile.getFileContent();
	content = content.toString().toList("\n");
	
	// 7. INITIATE THE HEADERS AND A LIST TO CREATE THE UPDATE CSV
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
  
	// 9. GENERATE THE UPDATE CSV FILE
	fileName = bulkJobName + ".csv";
	readyCsv = csvRows.toString("\n").toFile(fileName);
	
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
	
	// 11. COMPRESS THE CSV FILE
	compressedFile = readyCsv.compress(bulkJobName);
	info "compressedFile : " + compressedFile;
	
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
	
	// 13. GET FILE ID FROM THE UPLOAD & RUN THE BULK WRITE
	if(upload.get("code") == "FILE_UPLOAD_SUCCESS")
	{
		fileId = upload.get("details").get("file_id");
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
	
