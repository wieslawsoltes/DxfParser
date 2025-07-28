    // Convert a concatenated hex string into a Uint8Array.
    function hexStringToByteArray(hexString) {
      hexString = hexString.replace(/\s+/g, "");
      const byteLength = Math.floor(hexString.length / 2);
      const result = new Uint8Array(byteLength);
      for (let i = 0; i < byteLength; i++) {
        result[i] = parseInt(hexString.substr(i * 2, 2), 16);
      }
      return result;
    }
    
    // Produce a hex dump from a Uint8Array.
    function hexDump(buffer) {
      const bytesPerLine = 16;
      let result = "";
      for (let i = 0; i < buffer.length; i += bytesPerLine) {
        const lineBytes = Array.from(buffer.slice(i, i + bytesPerLine));
        const hexBytes = lineBytes.map(byte => byte.toString(16).padStart(2, '0'));
        const asciiChars = lineBytes.map(byte =>
          byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.'
        );
        while (hexBytes.length < bytesPerLine) {
          hexBytes.push("  ");
          asciiChars.push(" ");
        }
        result += i.toString(16).padStart(8, '0') + "  " +
                  hexBytes.join(" ") + "  " +
                  asciiChars.join("") + "\n";
      }
      return result;
    }
    
    // Attempt to detect a common file header from a Uint8Array.
    function detectHeader(buffer) {
      // Define a list of known file signatures.
      // Each signature can be defined as an array of byte values or as a string.
      // (You can add an "offset" property if the signature does not start at 0.)
      const signatures = [
        { type: "BMP Image",    signature: [0x42, 0x4D] },
        { type: "PNG Image",    signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
        { type: "GIF Image",    signature: "GIF87a" },
        { type: "GIF Image",    signature: "GIF89a" },
        { type: "JPEG Image",   signature: [0xFF, 0xD8, 0xFF] },
        { type: "PDF Document", signature: "%PDF" },
        { type: "ZIP Archive",  signature: [0x50, 0x4B, 0x03, 0x04] },
        // Additional formats:
        { type: "RAR Archive",  signature: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] },
        { type: "RAR Archive",  signature: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00] },
        { type: "7z Archive",   signature: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
        { type: "ELF Executable", signature: [0x7F, 0x45, 0x4C, 0x46] }
      ];

      // Iterate over the signature definitions.
      for (const sig of signatures) {
        // Determine the starting offset (default is 0)
        const offset = sig.offset || 0;
        // Ensure the buffer is long enough to check this signature.
        const sigLength = (typeof sig.signature === "string")
          ? sig.signature.length
          : sig.signature.length;
        if (buffer.length < offset + sigLength) continue;

        if (typeof sig.signature === "string") {
          // Compare the signature as a text string.
          const header = String.fromCharCode(...buffer.slice(offset, offset + sigLength));
          if (header === sig.signature) return sig.type;
        } else if (Array.isArray(sig.signature)) {
          // Compare the signature byte by byte.
          let match = true;
          for (let i = 0; i < sig.signature.length; i++) {
            if (buffer[offset + i] !== sig.signature[i]) {
              match = false;
              break;
            }
          }
          if (match) return sig.type;
        }
      }
      return null;
    }
    
    function isHandleCode(code) {
      return code === 5 ||
             code === 105 ||
             (code >= 320 && code <= 329) ||
             (code >= 330 && code <= 339) ||
             (code >= 340 && code <= 349) ||
             (code >= 350 && code <= 359) ||
             (code >= 360 && code <= 369) ||
             (code >= 390 && code <= 399) ||
             (code >= 480 && code <= 481) ||
             code === 1005;
    }
