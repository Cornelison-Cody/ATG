targetScope = 'resourceGroup'

@description('Azure region for all regional ATG resources.')
param location string = 'westus'

@description('Short environment name used in resource names.')
@minLength(2)
@maxLength(12)
param environmentName string = 'prod'

@description('Container image to run, usually ghcr.io/<owner>/<repo>:<sha>.')
param containerImage string

@description('Public HTTPS base URL for ATG. Leave empty on first deploy to use the Container Apps generated URL after the app exists.')
param appBaseUrl string = ''

@description('Optional custom hostname to bind to the Container App, for example tv.azuretidesgaming.com.')
param customDomainName string = ''

@description('Optional managed certificate resource id to use for the custom hostname binding.')
param customDomainCertificateId string = ''

@description('Hosted AI editing worker URL. Production chat editing requires this.')
param aiWorkerUrl string = ''

@description('Enable trusted local companion job polling when no hosted AI worker is configured.')
param enableLocalCompanion bool = false

@description('Enable the server-side Codex SDK dashboard chat endpoint.')
param enableCodexSdkPrototype bool = false

@secure()
@description('Bearer token for the hosted AI editing worker.')
param aiWorkerToken string = ''

@secure()
@description('Bearer token used by trusted local companion processes.')
param atgCompanionToken string = ''

@secure()
@description('OpenAI API key for hosted AI/worker integration.')
param openAiApiKey string = ''

@secure()
@description('Base64-encoded 32-byte key used to encrypt per-user OpenAI API keys.')
param userSettingsEncryptionKey string = ''

@description('Optional GitHub username for pulling private GHCR images.')
param ghcrUsername string = ''

@secure()
@description('Optional GitHub token with read:packages for pulling private GHCR images.')
param ghcrToken string = ''

@description('Microsoft Entra tenant id used by the app auth guard.')
param entraTenantId string

@description('Microsoft Entra application/client id used by the app auth guard.')
param entraClientId string

@secure()
@description('Client secret for the Microsoft Entra app registration used by Container Apps authentication.')
param entraClientSecret string = ''

@description('Audience expected for service-principal bearer tokens that call protected editor APIs.')
param entraApiAudience string = ''

@description('Comma-separated service principal application ids allowed to call protected editor APIs.')
param entraAllowedAppIds string = ''

@description('Minimum number of Container App replicas.')
param minReplicas int = 0

@description('Maximum number of Container App replicas.')
param maxReplicas int = 1

@description('CPU cores allocated per replica.')
param cpu string = '0.5'

@description('Memory allocated per replica.')
param memory string = '1Gi'

var normalizedEnvironment = toLower(environmentName)
var nameSeed = uniqueString(resourceGroup().id, normalizedEnvironment)
var prefix = 'atg-${normalizedEnvironment}-${nameSeed}'
var logAnalyticsName = '${prefix}-logs'
var containerAppsEnvironmentName = '${prefix}-env'
var containerAppName = '${prefix}-app'
var cosmosAccountName = 'atg-${take(normalizedEnvironment, 12)}-${nameSeed}-cosmos'
var cosmosDatabaseName = 'atg'
var cosmosProjectsContainerName = 'projects'
var cosmosUserSettingsContainerName = 'user-settings'
var storageAccountName = 'atg${take(normalizedEnvironment, 6)}${nameSeed}st'
var gameAssetsContainerName = 'game-assets'
var customDomains = empty(customDomainName) || empty(customDomainCertificateId) ? [] : [
  {
    name: customDomainName
    bindingType: 'SniEnabled'
    certificateId: customDomainCertificateId
  }
]
var containerAppSecrets = concat(
  [
    {
      name: 'cosmos-key'
      value: cosmosAccount.listKeys().primaryMasterKey
    }
    {
      name: 'storage-connection-string'
      value: storageConnectionString
    }
  ],
  empty(aiWorkerToken) ? [] : [
    {
      name: 'ai-worker-token'
      value: aiWorkerToken
    }
  ],
  empty(atgCompanionToken) ? [] : [
    {
      name: 'atg-companion-token'
      value: atgCompanionToken
    }
  ],
  empty(openAiApiKey) ? [] : [
    {
      name: 'openai-api-key'
      value: openAiApiKey
    }
  ],
  empty(userSettingsEncryptionKey) ? [] : [
    {
      name: 'user-settings-encryption-key'
      value: userSettingsEncryptionKey
    }
  ],
  empty(ghcrToken) ? [] : [
    {
      name: 'ghcr-token'
      value: ghcrToken
    }
  ],
  empty(entraClientSecret) ? [] : [
    {
      name: 'entra-client-secret'
      value: entraClientSecret
    }
  ]
)
var containerAppEnv = concat(
  [
    {
      name: 'NODE_ENV'
      value: 'production'
    }
    {
      name: 'PORT'
      value: '3000'
    }
    {
      name: 'APP_BASE_URL'
      value: appBaseUrl
    }
    {
      name: 'ATG_STORAGE_BACKEND'
      value: 'azure'
    }
    {
      name: 'AZURE_COSMOS_ENDPOINT'
      value: cosmosAccount.properties.documentEndpoint
    }
    {
      name: 'AZURE_COSMOS_DATABASE'
      value: cosmosDatabaseName
    }
    {
      name: 'AZURE_COSMOS_PROJECTS_CONTAINER'
      value: cosmosProjectsContainerName
    }
    {
      name: 'AZURE_COSMOS_USER_SETTINGS_CONTAINER'
      value: cosmosUserSettingsContainerName
    }
    {
      name: 'AZURE_COSMOS_KEY'
      secretRef: 'cosmos-key'
    }
    {
      name: 'AZURE_STORAGE_GAME_ASSETS_CONTAINER'
      value: gameAssetsContainerName
    }
    {
      name: 'AZURE_STORAGE_CONNECTION_STRING'
      secretRef: 'storage-connection-string'
    }
    {
      name: 'AI_WORKER_URL'
      value: aiWorkerUrl
    }
    {
      name: 'ENABLE_LOCAL_COMPANION'
      value: enableLocalCompanion ? 'true' : 'false'
    }
    {
      name: 'ENTRA_TENANT_ID'
      value: entraTenantId
    }
    {
      name: 'ENTRA_CLIENT_ID'
      value: entraClientId
    }
    {
      name: 'ENTRA_API_AUDIENCE'
      value: entraApiAudience
    }
    {
      name: 'ENTRA_ALLOWED_APP_IDS'
      value: entraAllowedAppIds
    }
    {
      name: 'ENABLE_LOCAL_CODEX'
      value: 'false'
    }
    {
      name: 'ENABLE_CODEX_SDK_PROTOTYPE'
      value: enableCodexSdkPrototype ? 'true' : 'false'
    }
  ],
  empty(aiWorkerToken) ? [] : [
    {
      name: 'AI_WORKER_TOKEN'
      secretRef: 'ai-worker-token'
    }
  ],
  empty(atgCompanionToken) ? [] : [
    {
      name: 'ATG_COMPANION_TOKEN'
      secretRef: 'atg-companion-token'
    }
  ],
  empty(openAiApiKey) ? [] : [
    {
      name: 'OPENAI_API_KEY'
      secretRef: 'openai-api-key'
    }
  ],
  empty(userSettingsEncryptionKey) ? [] : [
    {
      name: 'ATG_USER_SETTINGS_ENCRYPTION_KEY'
      secretRef: 'user-settings-encryption-key'
    }
  ]
)

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    capabilities: []
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  name: cosmosDatabaseName
  parent: cosmosAccount
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource projectsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: cosmosProjectsContainerName
  parent: cosmosDatabase
  properties: {
    resource: {
      id: cosmosProjectsContainerName
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

resource userSettingsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: cosmosUserSettingsContainerName
  parent: cosmosDatabase
  properties: {
    resource: {
      id: cosmosUserSettingsContainerName
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
}

resource gameAssetsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: gameAssetsContainerName
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        customDomains: customDomains
      }
      secrets: containerAppSecrets
      registries: empty(ghcrToken) ? [] : [
        {
          server: 'ghcr.io'
          username: ghcrUsername
          passwordSecretRef: 'ghcr-token'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'atg'
          image: containerImage
          env: containerAppEnv
          resources: {
            cpu: json(cpu)
            memory: memory
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
  dependsOn: [
    projectsContainer
    gameAssetsContainer
  ]
}

resource containerAppAuth 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (!empty(entraClientSecret)) {
  name: 'current'
  parent: containerApp
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'AllowAnonymous'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraClientId
          clientSecretSettingName: 'entra-client-secret'
          openIdIssuer: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            entraClientId
          ]
        }
      }
    }
  }
}

output containerAppName string = containerApp.name
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output cosmosAccountName string = cosmosAccount.name
output storageAccountName string = storageAccount.name
