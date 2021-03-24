// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
module.exports = {
    presets: ['module:metro-react-native-babel-preset'],
    env: {
        production: {
        },
    },
    plugins: [
        '@babel/plugin-transform-runtime',
        ['module-resolver', {
            root: ['.'],
            alias: {
                '@assets': './dist/assets',
                '@actions': './app/actions',
                '@components': './app/components',
                '@constants': './app/constants',
                '@i18n': './app/i18n',
                '@init': './app/init',
                '@mm-redux': './app/mm-redux',
                '@screens': './app/screens',
                '@selectors': './app/selectors',
                '@store': './app/store',
                '@telemetry': './app/telemetry',
                '@utils': './app/utils',
                '@websocket': './app/client/websocket',
            },
        }],
    ],
    exclude: ['**/*.png', '**/*.jpg', '**/*.gif'],
};
