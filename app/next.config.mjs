/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode:false,
    webpack: (config) => {
        config.resolve.alias["onnxruntime-node"] = false;
        return config;
    },
};

export default nextConfig;
