import React from 'react';
import { render, screen } from '@testing-library/react';
import AvatarComposerPanel from './AvatarComposerPanel';
import { getAvatarProfile } from './appHelpers';

const testCopy = {
  bubble1: 'user bubble',
  bubble2: 'assistant bubble',
  inputTag: 'input',
  inputPlaceholder: 'type here',
  replayViewing: 'replay',
  recording: 'recording',
  sending: 'sending',
  readyToChat: 'ready',
  sessionInteractionHint: 'hint',
  stopRecording: 'stop',
  startRecording: 'start',
  submitText: 'submit',
};

function renderAvatarPanel(overrides = {}) {
  return render(
    <AvatarComposerPanel
      activeMessage={1}
      assistantAudioRef={{ current: null }}
      avatarMouthState="closed"
      avatarSpeechState="idle"
      canSubmitText
      effectiveAvatarProfile={getAvatarProfile('companion_female_01')}
      handleMicAction={jest.fn()}
      inputText="hello"
      latestAssistantMessage={{ content_text: 'assistant reply' }}
      liveTranscriptText=""
      onInputChange={jest.fn()}
      recordingDurationMs={0}
      recordingState="idle"
      replayLocked={false}
      submitText={jest.fn()}
      t={testCopy}
      textSubmitState="idle"
      {...overrides}
    />,
  );
}

test('renders companion A through Live2D with fallback in jsdom', () => {
  renderAvatarPanel();

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(assistantSurface.querySelector('[data-live2d-state="fallback"]')).toBeInTheDocument();
});

test('keeps role B on the legacy svg renderer', () => {
  renderAvatarPanel({ effectiveAvatarProfile: getAvatarProfile('coach_male_01') });

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(assistantSurface.querySelector('[data-live2d-state]')).not.toBeInTheDocument();
  expect(assistantSurface.querySelector('svg')).toBeInTheDocument();
});
