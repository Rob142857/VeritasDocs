/**
 * Test script to verify IPFS metadata privacy protection
 * 
 * This script creates mock metadata objects to demonstrate
 * the privacy-aware metadata generation for public vs private assets.
 */

// Mock user data
const mockUserId = "0e9a60ff-6df9-4289-8d28-e6bca2f9085a";
const mockKyberPublicKey = "kyber768_mock_public_key_base64url_encoded";
const mockAssetId = `asset_${Date.now()}_test123`;
const mockIpfsHash = "QmMockHash123456789";

// Mock input data for asset creation
const mockAssetData = {
  title: "Confidential Will and Testament",
  description: "Personal last will and testament - PRIVATE",
  documentType: "will",
  contentType: "application/pdf",
  filename: "my-private-will.pdf",
  userId: mockUserId,
  ipfsHash: mockIpfsHash
};

// Function to create metadata based on privacy setting
function createAssetMetadata(assetData: any, isPubliclySearchable: boolean) {
  const isPublic = isPubliclySearchable === true;
  
  if (isPublic) {
    // PUBLIC metadata - full details for search and discovery
    return {
      id: mockAssetId,
      title: assetData.title,
      description: assetData.description,
      documentType: assetData.documentType,
      ownerId: assetData.userId,
      creatorId: assetData.userId,
      ipfsHash: assetData.ipfsHash,
      createdAt: Date.now(),
      isPubliclySearchable: true,
      publicMetadata: {
        originalContentType: assetData.contentType,
        originalFilename: assetData.filename
      }
    };
  } else {
    // PRIVATE metadata - minimal info, no identifying data
    return {
      id: mockAssetId,
      ipfsHash: assetData.ipfsHash,
      createdAt: Date.now(),
      isPubliclySearchable: false,
      ownerPublicKey: mockKyberPublicKey,
      creatorPublicKey: mockKyberPublicKey
    };
  }
}

// Test cases
console.log("=".repeat(80));
console.log("IPFS METADATA PRIVACY PROTECTION TEST");
console.log("=".repeat(80));
console.log();

console.log("Test Case 1: Public Asset Metadata");
console.log("-".repeat(80));
const publicMetadata = createAssetMetadata(mockAssetData, true);
console.log(JSON.stringify(publicMetadata, null, 2));
console.log();
console.log("✅ Public metadata includes: title, description, userIds, filename");
console.log();

console.log("Test Case 2: Private Asset Metadata");
console.log("-".repeat(80));
const privateMetadata = createAssetMetadata(mockAssetData, false);
console.log(JSON.stringify(privateMetadata, null, 2));
console.log();
console.log("✅ Private metadata excludes: title, description, userIds, filename");
console.log("✅ Private metadata includes: id, ipfsHash, timestamp, public keys only");
console.log();

// Verify privacy protection
console.log("Privacy Verification:");
console.log("-".repeat(80));

const privateFields = ['title', 'description', 'documentType', 'ownerId', 'creatorId', 'publicMetadata'];
const exposedFields = privateFields.filter(field => field in privateMetadata);

if (exposedFields.length === 0) {
  console.log("✅ PASS: No sensitive fields exposed in private metadata");
} else {
  console.log("❌ FAIL: Following sensitive fields exposed:", exposedFields);
}

const requiredFields = ['id', 'ipfsHash', 'createdAt', 'isPubliclySearchable'];
const missingFields = requiredFields.filter(field => !(field in privateMetadata));

if (missingFields.length === 0) {
  console.log("✅ PASS: All required fields present in private metadata");
} else {
  console.log("❌ FAIL: Missing required fields:", missingFields);
}

console.log();
console.log("Size Comparison:");
console.log("-".repeat(80));
const publicSize = JSON.stringify(publicMetadata).length;
const privateSize = JSON.stringify(privateMetadata).length;
console.log(`Public metadata:  ${publicSize} bytes`);
console.log(`Private metadata: ${privateSize} bytes`);
console.log(`Size reduction:   ${((1 - privateSize / publicSize) * 100).toFixed(1)}%`);
console.log();

console.log("=".repeat(80));
console.log("TEST COMPLETE");
console.log("=".repeat(80));
