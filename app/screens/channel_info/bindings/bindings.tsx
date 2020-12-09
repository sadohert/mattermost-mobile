// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import Separator from '@screens/channel_info/separator';

import ChannelInfoRow from '../channel_info_row';
import {AppBinding} from '@mm-redux/types/apps';
import {Theme} from '@mm-redux/types/preferences';
import {Channel} from '@mm-redux/types/channels';
import {doAppCall} from '@actions/apps';
import {AppsBindings} from '@mm-redux/constants/apps';
import {UserProfile} from '@mm-redux/types/users';

type Props = {
    bindings: AppBinding[];
    theme: Theme;
    currentChannel: Channel;
    currentUser: UserProfile;
}

const Bindings = (props: Props) => {
    const {bindings, ...optionProps} = props;
    if (bindings.length === 0) {
        return null;
    }

    const options = bindings.map((b) => (
        <Option
            key={b.app_id + b.location}
            binding={b}
            {...optionProps}
        />
    ));

    return (
        <>
            {options}
        </>
    );
};

export default Bindings;

type OptionProps = {
    binding: AppBinding;
    theme: Theme;
    currentChannel: Channel;
    currentUser: UserProfile;
}

const Option = (props: OptionProps) => {
    const onPress = () => {
        const channelId = props.currentChannel.id;

        // TODO Consider handling result here
        doAppCall({
            context: {
                app_id: props.binding.app_id,
                channel_id: channelId,
                location: AppsBindings.CHANNEL_HEADER_ICON,
                user_id: props.currentUser.id,
            },
            url: props.binding.call?.url || '',
        });
    };

    const {binding, theme} = props;
    return (
        <>
            <Separator theme={theme}/>
            <ChannelInfoRow
                action={onPress}
                defaultMessage={binding.label}
                theme={theme}
                textId={binding.app_id + binding.location}
                image={{uri: binding.icon}}
            />
        </>
    );
};
