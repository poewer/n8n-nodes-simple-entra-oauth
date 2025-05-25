import {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
	ICredentialDataDecryptedObject,
	IHttpRequestOptions,
} from 'n8n-workflow';

export class MicrosoftEntraOAuthCredentials implements ICredentialType {
	name = 'microsoftEntraOAuthCredentials';
	displayName = 'Microsoft Entra ID OAuth';
	documentationUrl = 'https://docs.microsoft.com/en-us/azure/active-directory/develop/';
	
	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Tenant ID',
			name: 'tenantId',
			type: 'string',
			default: '',
			required: true,
			description: 'Azure AD Tenant ID (Directory ID)',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'Application (client) ID from Azure App Registration',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Client Secret from Azure App Registration',
		},
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Current OAuth Access Token',
		},
		{
			displayName: 'Refresh Token',
			name: 'refreshToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'OAuth Refresh Token for token renewal',
		},
		{
			displayName: 'ID Token',
			name: 'idToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'OpenID Connect ID Token',
		},
		{
			displayName: 'Token Type',
			name: 'tokenType',
			type: 'string',
			default: 'Bearer',
			description: 'OAuth Token Type',
		},
		{
			displayName: 'Expires In',
			name: 'expiresIn',
			type: 'number',
			default: 3600,
			description: 'Token expiration time in seconds',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: '',
			description: 'Granted OAuth scopes',
		},
		{
			displayName: 'Created At',
			name: 'createdAt',
			type: 'dateTime',
			default: '',
			description: 'When the credential was created',
		},
		{
			displayName: 'User Info',
			name: 'userInfo',
			type: 'json',
			default: '{}',
			description: 'User information from Microsoft Graph',
		},
		{
			displayName: 'User ID',
			name: 'userId',
			type: 'string',
			default: '',
			description: 'Internal user identifier',
		},
	];

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const accessToken = credentials.accessToken as string;
		
		if (!accessToken) {
			throw new Error('No access token available. Please re-authenticate using the OAuth flow.');
		}

		// Check if token might be expired and refresh if needed
		const expiresIn = credentials.expiresIn as number;
		const createdAt = credentials.createdAt as string;
		
		if (createdAt && expiresIn) {
			const tokenAge = (Date.now() - new Date(createdAt).getTime()) / 1000;
			if (tokenAge >= expiresIn - 300) { // Refresh 5 minutes before expiry
				// Use process.stdout.write instead of console.warn for better compatibility
				process.stdout.write('Access token is near expiry. Consider implementing token refresh logic.\n');
			}
		}

		// Add authorization header
		requestOptions.headers = {
			...requestOptions.headers,
			'Authorization': `Bearer ${accessToken}`,
			'Accept': 'application/json',
			'Content-Type': 'application/json',
		};

		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://graph.microsoft.com',
			url: '/v1.0/me',
			method: 'GET',
		},
	};
}