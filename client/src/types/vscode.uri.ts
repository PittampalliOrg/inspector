// Simplified URI implementation based on relevant parts of VS Code's URI

export interface UriComponents {
    scheme: string;
    authority: string;
    path: string;
    query: string;
    fragment: string;
}

export class URI implements UriComponents {
    scheme: string;
    authority: string;
    path: string;
    query: string;
    fragment: string;

    protected constructor(components: UriComponents) {
        this.scheme = components.scheme;
        this.authority = components.authority;
        this.path = components.path;
        this.query = components.query;
        this.fragment = components.fragment;
    }

    static parse(value: string): URI {
        // Basic parsing, assumes well-formed URI string for this context
        try {
            const url = new URL(value);
            return new URI({
                scheme: url.protocol.replace(/:$/, ''),
                authority: url.host, // Includes port
                path: url.pathname,
                query: url.search.substring(1), // Remove leading '?'
                fragment: url.hash.substring(1) // Remove leading '#'
            });
        } catch (e) {
            // Fallback for non-standard schemes like 'file:' which URL constructor might struggle with depending on context
            const schemeMatch = value.match(/^([a-z][a-z0-9+\-.]*):/i);
            if (schemeMatch) {
                const scheme = schemeMatch[1];
                // WARNING: This is a very naive parser for non-URL schemes, might not handle complex cases well.
                // Adjust parsing logic if necessary for specific schemes you encounter.
                const rest = value.substring(scheme.length + 1);
                let authority = '';
                let path = rest;
                if (rest.startsWith('//')) {
                     const authorityEnd = rest.indexOf('/', 2);
                     if (authorityEnd !== -1) {
                         authority = rest.substring(2, authorityEnd);
                         path = rest.substring(authorityEnd);
                     } else {
                          authority = rest.substring(2);
                          path = '';
                     }
                }
                // Very basic query/fragment split
                const fragmentIdx = path.lastIndexOf('#');
                const fragment = fragmentIdx !== -1 ? path.substring(fragmentIdx + 1) : '';
                path = fragmentIdx !== -1 ? path.substring(0, fragmentIdx) : path;
                const queryIdx = path.lastIndexOf('?');
                const query = queryIdx !== -1 ? path.substring(queryIdx + 1) : '';
                path = queryIdx !== -1 ? path.substring(0, queryIdx) : path;


                return new URI({ scheme, authority, path, query, fragment });

            }
            throw new Error(`Invalid URI: ${value}`);
        }
    }

    static file(path: string): URI {
        // Basic file URI creation, might need platform-specific path handling
        // Ensure the path starts with a '/' if it's not already absolute on non-Windows
        let formattedPath = path.replace(/\\/g, '/');
        if (process.platform !== 'win32' && !formattedPath.startsWith('/')) {
            formattedPath = '/' + formattedPath;
        }
         // Ensure correct slashes for file URI authority (empty for local files)
        const fileUriString = `file://${formattedPath}`;
        return URI.parse(fileUriString);
    }

    static revive(data: UriComponents | any): URI {
        if (!data) {
			return data;
		} else if (data instanceof URI) {
			return data;
		} else {
			return new URI(data);
		}
    }

    toString(skipEncoding?: boolean): string {
        // Basic toString, might need proper encoding based on 'skipEncoding'
        let result = `${this.scheme}:`;
        if (this.authority || this.scheme === 'file') {
             result += `//${this.authority}`;
        }
        result += this.path;
        if (this.query) {
            result += `?${this.query}`;
        }
        if (this.fragment) {
            result += `#${this.fragment}`;
        }
        return result;
    }

    toJSON(): UriComponents {
        return {
            scheme: this.scheme,
            authority: this.authority,
            path: this.path,
            query: this.query,
            fragment: this.fragment,
        };
    }
}

export function isUriComponents(thing: any): thing is UriComponents {
	if (!thing || typeof thing !== 'object') {
		return false;
	}
	return typeof (<UriComponents>thing).scheme === 'string'
		&& typeof (<UriComponents>thing).path === 'string'
		&& typeof (<UriComponents>thing).authority === 'string'
		&& typeof (<UriComponents>thing).query === 'string'
		&& typeof (<UriComponents>thing).fragment === 'string';
}