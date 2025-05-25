import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	IDataObject,
	NodeConnectionType,
} from 'n8n-workflow';

// Helper functions defined before the class
async function createN8nCredential(
	context: IExecuteFunctions,
	credentialName: string,
	credentialData: IDataObject,
	n8nApiConfig: IDataObject
): Promise<IDataObject> {
	const apiUrl = n8nApiConfig.apiUrl as string || 'http://localhost:5678/api/v1';
	const apiKey = n8nApiConfig.apiKey as string;

	// Prepare headers
	const headers: IDataObject = {
		'Content-Type': 'application/json',
	};

	if (apiKey) {
		headers['X-N8N-API-KEY'] = apiKey;
	}

	// Create credential via n8n API
	const credentialPayload = {
		name: credentialName,
		type: 'microsoftEntraOAuthCredentials',
		data: credentialData,
	};

	try {
		const response = await context.helpers.request({
			method: 'POST',
			url: `${apiUrl}/credentials`,
			headers,
			body: credentialPayload,
		});

		return {
			success: true,
			credentialId: response.id,
			credentialName: response.name,
			message: 'Credential created successfully in n8n',
			response
		};
	} catch (error: any) {
		// If API call fails, return error info but don't throw
		return {
			success: false,
			error: error.message,
			message: 'Failed to create credential via API - you can create it manually',
			apiUrl,
			hasApiKey: !!apiKey
		};
	}
}

function evaluateTemplate(template: string, data: IDataObject): string {
	let result = template;
	
	// Replace template variables
	result = result.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expr) => {
		// Handle special functions
		if (expr.trim() === 'Date.now()') {
			return Date.now().toString();
		}
		
		// Handle nested properties
		const keys = expr.trim().split('.');
		let value: any = data;
		for (const key of keys) {
			if (key.startsWith('$json.')) {
				const jsonKey = key.substring(6);
				value = data[jsonKey];
			} else {
				value = value?.[key];
			}
			if (value === undefined) break;
		}
		
		return value?.toString() || '';
	});

	// Clean up the name (remove invalid characters)
	result = result.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/__+/g, '_');
	
	return result;
}

export class SimpleEntraTokenExchangeNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Simple Entra Token Exchange',
		name: 'simpleEntraTokenExchange',
		group: ['transform'],
		version: 1,
		description: 'Exchange OAuth authorization code for access tokens and create credentials',
		defaults: {
			name: 'Simple Entra Token Exchange',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Azure Configuration',
				name: 'azureConfig',
				type: 'collection',
				placeholder: 'Add Azure Config',
				default: {},
				options: [
					{
						displayName: 'Tenant ID',
						name: 'tenantId',
						type: 'string',
						default: '',
						required: false,
						description: 'Azure AD Tenant ID',
					},
					{
						displayName: 'Client ID',
						name: 'clientId',
						type: 'string',
						default: '',
						required: false,
						description: 'Application Client ID from Azure',
					},
					{
						displayName: 'Client Secret',
						name: 'clientSecret',
						type: 'string',
						typeOptions: {
							password: true,
						},
						default: '',
						required: false,
						description: 'Client Secret from Azure',
					},
				],
			},
			{
				displayName: 'Authorization Code',
				name: 'authCode',
				type: 'string',
				default: '{{ $json.code }}',
				placeholder: '{{ $json.code }} or {{ $json.query.code }}',
				required: false,
				description: 'Authorization code from OAuth callback - use expression to get from webhook data',
			},
			{
				displayName: 'Redirect URI',
				name: 'redirectUri',
				type: 'string',
				default: '',
				placeholder: 'http://localhost:5678/webhook/WORKFLOW_ID/oauth?userId=USER_ID',
				required: false,
				description: 'Must match the redirect URI used in authorization request - copy from your Azure app configuration',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '{{ $json.userId }}',
				placeholder: '{{ $json.userId }} or {{ $json.query.userId }}',
				description: 'User identifier for credential naming - use expression to get from webhook data',
			},
			{
				displayName: 'Auto-Create Credential',
				name: 'autoCreateCredential',
				type: 'boolean',
				default: false,
				description: 'Automatically create credential in n8n after successful token exchange',
			},
			{
				displayName: 'n8n API Configuration',
				name: 'n8nApiConfig',
				type: 'collection',
				placeholder: 'Add n8n API Config',
				default: {},
				displayOptions: {
					show: {
						autoCreateCredential: [true],
					},
				},
				options: [
					{
						displayName: 'n8n API URL',
						name: 'apiUrl',
						type: 'string',
						default: 'http://localhost:5678/api/v1',
						description: 'n8n API base URL',
					},
					{
						displayName: 'API Key',
						name: 'apiKey',
						type: 'string',
						typeOptions: {
							password: true,
						},
						default: '',
						description: 'n8n API key (if authentication is enabled)',
					},
				],
			},
			{
				displayName: 'Credential Name Template',
				name: 'credentialNameTemplate',
				type: 'string',
				default: 'entra_oauth_{{ userPrincipalName }}_{{ Date.now() }}',
				description: 'Template for generating credential names',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const azureConfig = this.getNodeParameter('azureConfig', i) as IDataObject;
				const authCode = this.getNodeParameter('authCode', i) as string;
				const redirectUri = this.getNodeParameter('redirectUri', i) as string;
				const userId = this.getNodeParameter('userId', i) as string;
				const autoCreateCredential = this.getNodeParameter('autoCreateCredential', i) as boolean;
				const n8nApiConfig = this.getNodeParameter('n8nApiConfig', i) as IDataObject;
				const credentialNameTemplate = this.getNodeParameter('credentialNameTemplate', i) as string;

				const tenantId = azureConfig.tenantId as string;
				const clientId = azureConfig.clientId as string;
				const clientSecret = azureConfig.clientSecret as string;

				// Debug logging
				process.stdout.write(`=== DEBUG TOKEN EXCHANGE ===\n`);
				process.stdout.write(`- authCode length: ${authCode ? authCode.length : 'missing'}\n`);
				process.stdout.write(`- authCode preview: ${authCode ? authCode.substring(0, 50) + '...' : 'missing'}\n`);
				process.stdout.write(`- redirectUri: ${redirectUri}\n`);
				process.stdout.write(`- userId: ${userId}\n`);
				process.stdout.write(`- tenantId: ${tenantId}\n`);
				process.stdout.write(`- clientId: ${clientId}\n`);
				process.stdout.write(`- clientSecret length: ${clientSecret ? clientSecret.length : 'missing'}\n`);

				if (!authCode) {
					throw new NodeOperationError(
						this.getNode(),
						`No authorization code provided. Received data: ${JSON.stringify(items[i].json)}`,
						{ itemIndex: i }
					);
				}

				if (!redirectUri) {
					throw new NodeOperationError(
						this.getNode(),
						'Redirect URI is required',
						{ itemIndex: i }
					);
				}

				if (!tenantId || !clientId || !clientSecret) {
					throw new NodeOperationError(
						this.getNode(),
						'Azure configuration is incomplete. Please fill in Tenant ID, Client ID, and Client Secret',
						{ itemIndex: i }
					);
				}

				// Exchange code for tokens
				let tokenResponse;
				try {
					const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
					const requestBody = {
						grant_type: 'authorization_code',
						code: authCode,
						client_id: clientId,
						client_secret: clientSecret,
						redirect_uri: redirectUri,
					};
					
					process.stdout.write(`Making token request to: ${tokenUrl}\n`);
					process.stdout.write(`Request body: ${JSON.stringify(requestBody, null, 2)}\n`);
					
					const rawResponse = await this.helpers.request({
						method: 'POST',
						url: tokenUrl,
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
						},
						form: requestBody,
					});
					
					process.stdout.write(`Microsoft raw response: ${JSON.stringify(rawResponse)}\n`);
					
					// Parse response if it's a string
					if (typeof rawResponse === 'string') {
						tokenResponse = JSON.parse(rawResponse);
						process.stdout.write(`Parsed token response: ${JSON.stringify(tokenResponse, null, 2)}\n`);
					} else {
						tokenResponse = rawResponse;
					}
					
				} catch (error: any) {
					process.stdout.write(`Microsoft token error: ${JSON.stringify(error.response?.data || error.message, null, 2)}\n`);
					throw new NodeOperationError(
						this.getNode(),
						`Failed to exchange authorization code for tokens: ${error.message}. Check your Azure configuration and redirect URI.`,
						{ itemIndex: i }
					);
				}

				// Get user information
				let userInfo: IDataObject = {};
				try {
					userInfo = await this.helpers.request({
						method: 'GET',
						url: 'https://graph.microsoft.com/v1.0/me',
						headers: {
							'Authorization': `Bearer ${tokenResponse.access_token}`,
						},
					});
				} catch (error: any) {
					process.stderr.write(`Failed to get user info: ${error.message}\n`);
					userInfo = {
						displayName: 'Unknown User',
						userPrincipalName: 'unknown@example.com',
					};
				}

				// Generate credential name
				const credentialName = evaluateTemplate(credentialNameTemplate, {
					...userInfo,
					userId,
					timestamp: Date.now(),
				});

				// Prepare credential data
				const credentialData = {
					tenantId,
					clientId,
					clientSecret,
					accessToken: tokenResponse.access_token,
					refreshToken: tokenResponse.refresh_token,
					idToken: tokenResponse.id_token,
					tokenType: tokenResponse.token_type || 'Bearer',
					expiresIn: tokenResponse.expires_in || 3600,
					scope: tokenResponse.scope,
					userId,
					userInfo: JSON.stringify(userInfo),
					createdAt: new Date().toISOString(),
				};

				// Debug credential data
				process.stdout.write(`=== CREDENTIAL DATA DEBUG ===\n`);
				process.stdout.write(`- accessToken: ${credentialData.accessToken ? 'present' : 'MISSING!'}\n`);
				process.stdout.write(`- refreshToken: ${credentialData.refreshToken ? 'present' : 'MISSING!'}\n`);
				process.stdout.write(`- tokenType: ${credentialData.tokenType}\n`);
				process.stdout.write(`- expiresIn: ${credentialData.expiresIn}\n`);
				process.stdout.write(`- scope: ${credentialData.scope || 'none'}\n`);

				let credentialCreationResult: any = null;

				// Try to create credential automatically if enabled
				if (autoCreateCredential) {
					try {
						credentialCreationResult = await createN8nCredential(
							this,
							credentialName,
							credentialData,
							n8nApiConfig
						);
					} catch (error: any) {
						process.stderr.write(`Failed to create credential automatically: ${error.message}\n`);
						credentialCreationResult = {
							success: false,
							error: error.message,
							message: 'Automatic credential creation failed - use manual creation'
						};
					}
				}

				const responseData = {
					success: true,
					credentialName,
					credentialData,
					userInfo,
					tokenInfo: {
						tokenType: tokenResponse.token_type,
						expiresIn: tokenResponse.expires_in,
						scope: tokenResponse.scope,
						hasRefreshToken: !!tokenResponse.refresh_token,
					},
					credentialCreation: credentialCreationResult,
					message: 'Token exchange successful',
					timestamp: new Date().toISOString(),
					manualInstructions: {
						step1: 'Go to Settings → Credentials in n8n',
						step2: 'Create new → Microsoft Entra ID OAuth',
						step3: 'Fill in the credential data from credentialData object above',
						step4: 'Save and test the credential'
					}
				};

				returnData.push({
					json: responseData,
					pairedItem: {
						item: i,
					},
				});

			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
							success: false,
							timestamp: new Date().toISOString(),
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}