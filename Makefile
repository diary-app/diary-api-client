gen-client:
	openapi-generator generate -i ../diary-api/api/swagger.yml -g typescript-axios -o ./src/base-client \
	  --skip-validate-spec