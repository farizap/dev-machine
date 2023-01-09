down:
	pulumi destroy -f --target urn:pulumi:dev::pulumi-quickstart::aws:ec2/eipAssociation:EipAssociation::eipassoc --target urn:pulumi:dev::pulumi-quickstart::aws:ec2/spotInstanceRequest:SpotInstanceRequest::cheap_worker --target urn:pulumi:dev::pulumi-quickstart::cloudflare:index/record:Record::sample-record 

up:
	pulumi up -f