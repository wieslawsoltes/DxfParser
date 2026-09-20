import {createAssetStreams} from './asset-streams.js';
import {createAssetCodecs} from './asset-codecs.js';
import {createAssetPixels} from './asset-pixels.js';
import {createAssetTextBlobs} from './asset-textblobs.js';
export function installAssetExtensions(K,api){if(api.__assetExtensionsInstalled)return api;Object.defineProperty(api,"__assetExtensionsInstalled",{value:true});Object.assign(api,createAssetStreams(K,api));Object.assign(api,createAssetCodecs(K,api));Object.assign(api,createAssetPixels(K,api));Object.assign(api,createAssetTextBlobs(K,api));return api;}
