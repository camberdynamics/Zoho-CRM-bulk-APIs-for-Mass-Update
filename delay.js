sleep = invokeurl
[
	url :"https://httpstat.us/200?sleep=" + waitTimeInSeconds * 1000
	type :GET
	detailed:true
];
return sleep;
