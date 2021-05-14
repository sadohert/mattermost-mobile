// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import {injectIntl, intlShape} from 'react-intl';
import {
    Text,
    View,
    Platform,
} from 'react-native';
import {WebView} from 'react-native-webview';
import CookieManager from 'react-native-cookies';
import urlParse from 'url-parse';

import {Client4} from '@mm-redux/client';

import {ViewTypes} from 'app/constants';
import Loading from 'app/components/loading';
import {paddingHorizontal as padding} from 'app/components/safe_area_view/iphone_x_spacing';
import StatusBar from 'app/components/status_bar';
import {resetToChannel} from 'app/actions/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from 'app/utils/theme';
import tracker from 'app/utils/time_tracker';

const HEADERS = {
    'X-Mobile-App': 'mattermost',
};

const postMessageJS = "window.postMessage(document.body.innerText, '*');";

// Used to make sure that OneLogin forms scale appropriately on both platforms.
const oneLoginFormScalingJS = `
    (function() {
        var loginPage = document.getElementById('login-page');
        var submitButton = document.getElementById('user_submit');

        if (loginPage) {
            loginPage.setAttribute('style', 'background-repeat: repeat-y;');
        }
        
        function resetPadding() {
            var mainBody = document.getElementById('body-main');
            
            if (mainBody) {
                mainBody.setAttribute('style', 'height: auto; padding: 10px 0;');
            }

            if (submitButton) {
                submitButton.removeEventListener('click', resetPadding);
            }
        }

        resetPadding();
        
        if (submitButton) {
            submitButton.addEventListener('click', resetPadding);
        }
    })();
`;

class SSO extends PureComponent {
    static propTypes = {
        actions: PropTypes.shape({
            scheduleExpiredNotification: PropTypes.func.isRequired,
            ssoLogin: PropTypes.func.isRequired,
        }).isRequired,
        intl: intlShape.isRequired,
        isLandscape: PropTypes.bool.isRequired,
        serverUrl: PropTypes.string.isRequired,
        ssoType: PropTypes.string.isRequired,
        theme: PropTypes.object,
    };

    useWebkit = true;

    constructor(props) {
        super(props);

        this.state = {
            error: null,
            renderWebView: true,
            jsCode: '',
            messagingEnabled: false,
        };

        switch (props.ssoType) {
        case ViewTypes.GITLAB:
            this.loginUrl = `${props.serverUrl}/oauth/gitlab/mobile_login`;
            this.completeUrlPath = '/signup/gitlab/complete';
            break;
        case ViewTypes.SAML:
            this.loginUrl = `${props.serverUrl}/login/sso/saml?action=mobile`;
            this.completeUrlPath = '/login/sso/saml';
            break;
        case ViewTypes.OFFICE365:
            this.loginUrl = `${props.serverUrl}/oauth/office365/mobile_login`;
            this.completeUrlPath = '/signup/office365/complete';
            break;
        }

        if (Platform.OS === 'ios') {
            this.useWebkit = parseInt(Platform.Version, 10) >= 11;
        }
        console.log('BofA_DEBUG: SSO Constructor ', props.ssoType, this.loginUrl, this.completeUrlPath); // eslint-disable-line no-console
    }

    componentWillUnmount() {
        clearTimeout(this.cookiesTimeout);
    }

    extractCookie = (parsedUrl) => {
        const original = urlParse(this.props.serverUrl);

        // Check whether we need to set a sub-path
        parsedUrl.set('pathname', original.pathname || '');

        // Rebuild the server url without query string and/or hash
        const url = `${parsedUrl.origin}${parsedUrl.pathname}`;
        Client4.setUrl(url);

        CookieManager.get(url, true).then((res) => {
            const mmtoken = res.MMAUTHTOKEN;
            const csrf = res.MMCSRF;
            const token = typeof mmtoken === 'object' ? mmtoken.value : mmtoken;
            const csrfToken = typeof csrf === 'object' ? csrf.value : csrf;

            console.log('BofA_DEBUG: Cookie Resolved mmtoken:', mmtoken); // eslint-disable-line no-console

            if (csrfToken) {
                Client4.setCSRF(csrfToken);
            }

            if (token) {
                clearTimeout(this.cookiesTimeout);
                this.setState({renderWebView: false});
                const {
                    ssoLogin,
                } = this.props.actions;

                Client4.setToken(token);
                ssoLogin().then((result) => {
                    if (result.error) {
                        this.onLoadEndError(result.error);
                        return;
                    }
                    this.goToChannel();
                });
            } else if (this.webView && !this.state.error) {
                this.webView.injectJavaScript(postMessageJS);
                console.log('BofA_DEBUG: Setting Cookie Timeout to 250ms'); // eslint-disable-line no-console
                this.cookiesTimeout = setTimeout(this.extractCookie.bind(null, parsedUrl), 250);
            } else {
                console.log('BofA_DEBUG: Extract Cookie ended this.state.error=:', this.state.error); // eslint-disable-line no-console
            }
        });
    }

    goToChannel = () => {
        tracker.initialLoad = Date.now();

        this.scheduleSessionExpiredNotification();

        console.log('BofA_DEBUG: resetToChannel'); // eslint-disable-line no-console
        resetToChannel();
    };

    onMessage = (event) => {
        try {
            const response = JSON.parse(event.nativeEvent.data);
            if (response) {
                const {
                    id,
                    message,
                    status_code: statusCode,
                } = response;
                console.log('BofA_DEBUG: onMessage - message:', message, ' status_code:', statusCode); // eslint-disable-line no-console
                if (id && message && statusCode !== 200) {
                    clearTimeout(this.cookiesTimeout);
                    this.setState({error: message});
                }
            }
        } catch (e) {
            // do nothing
            console.log('BofA_DEBUG: onMessage Exception:', e); // eslint-disable-line no-console
        }
    };

    onNavigationStateChange = (navState) => {
        const {url} = navState;
        const nextState = {
            messagingEnabled: false,
        };
        const parsed = urlParse(url);

        if (parsed.host.includes('.onelogin.com')) {
            nextState.jsCode = oneLoginFormScalingJS;
        } else if (parsed.pathname === this.completeUrlPath) {
            // To avoid `window.postMessage` conflicts in any of the SSO flows
            // we enable the onMessage handler only When the webView navigates to the final SSO URL.
            nextState.messagingEnabled = true;
        }
        console.log('BofA_DEBUG: onNavigationStateChange ', url); // eslint-disable-line no-console

        this.setState(nextState);
    };

    onLoadEnd = (event) => {
        const url = event.nativeEvent.url;
        const parsed = urlParse(url);

        let isLastRedirect = url.includes(this.completeUrlPath);
        if (this.props.ssoType === ViewTypes.SAML) {
            isLastRedirect = isLastRedirect && !parsed.query;
        }

        if (isLastRedirect) {
            this.extractCookie(parsed);
        }
        console.log('BofA_DEBUG: onLoadEnd ', event.navState, url); // eslint-disable-line no-console
    };

    onLoadEndError = (e) => {
        console.warn('Failed to set store from local data', e); // eslint-disable-line no-console
        let error = e.message;
        if (e.details) {
            error += `\n${e.details.message}`;
        }

        if (e.url) {
            error += `\nURL: ${e.url}`;
        }
        this.setState({error});
    };

    scheduleSessionExpiredNotification = () => {
        const {actions, intl} = this.props;

        actions.scheduleExpiredNotification(intl);
    };

    renderLoading = () => {
        return <Loading/>;
    };

    webViewRef = (ref) => {
        this.webView = ref;
    };

    render() {
        const {theme, isLandscape} = this.props;
        const {error, messagingEnabled, renderWebView, jsCode} = this.state;
        const style = getStyleSheet(theme);

        let content;
        if (error) {
            content = (
                <View style={style.errorContainer}>
                    <Text style={style.errorText}>{error}</Text>
                </View>
            );
        } else if (renderWebView) {
            content = (
                <WebView
                    ref={this.webViewRef}
                    source={{uri: this.loginUrl, headers: HEADERS}}
                    javaScriptEnabledAndroid={true}
                    automaticallyAdjustContentInsets={false}
                    startInLoadingState={true}
                    onNavigationStateChange={this.onNavigationStateChange}
                    onShouldStartLoadWithRequest={() => true}
                    injectedJavaScript={jsCode}
                    onLoadEnd={this.onLoadEnd}
                    onMessage={messagingEnabled ? this.onMessage : null}
                    useSharedProcessPool={false}
                    cacheEnabled={false}
                />
            );
        } else {
            content = this.renderLoading();
        }

        return (
            <View style={[style.container, padding(isLandscape)]}>
                <StatusBar/>
                {content}
            </View>
        );
    }
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        container: {
            flex: 1,
        },
        errorContainer: {
            alignItems: 'center',
            flex: 1,
            marginTop: 40,
        },
        errorText: {
            color: changeOpacity(theme.centerChannelColor, 0.4),
            fontSize: 16,
            fontWeight: '400',
            lineHeight: 23,
            paddingHorizontal: 30,
        },
    };
});

export default injectIntl(SSO);
