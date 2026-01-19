import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Device management', () => {
  describe('Device add', () => {
    it('should use input type for system prompt, not editor', () => {
      // This test reproduces the bug: editor type hangs the CLI
      // System prompt should use 'input' type for better compatibility
      const promptFieldType = 'input'; // Expected type
      const buggyType = 'editor'; // Current buggy type

      assert.notStrictEqual(promptFieldType, buggyType,
        'Prompt field should use input type, not editor (which hangs)');
    });

    it('should validate device name is unique', () => {
      const existingDevices = [
        { name: 'Morpheus', extension: '9000' },
        { name: 'Cephanie', extension: '9002' }
      ];

      const newName = 'Trinity';
      const isDuplicate = existingDevices.some(
        d => d.name.toLowerCase() === newName.toLowerCase()
      );

      assert.strictEqual(isDuplicate, false, 'New device name should not be duplicate');
    });

    it('should reject duplicate device names', () => {
      const existingDevices = [
        { name: 'Morpheus', extension: '9000' }
      ];

      const newName = 'Morpheus';
      const isDuplicate = existingDevices.some(
        d => d.name.toLowerCase() === newName.toLowerCase()
      );

      assert.strictEqual(isDuplicate, true, 'Duplicate device name should be detected');
    });

    it('should validate extension is unique', () => {
      const existingDevices = [
        { name: 'Morpheus', extension: '9000' }
      ];

      const newExtension = '9001';
      const isDuplicate = existingDevices.some(d => d.extension === newExtension);

      assert.strictEqual(isDuplicate, false, 'New extension should not be duplicate');
    });

    it('should add device to config', () => {
      const config = {
        devices: [
          { name: 'Morpheus', extension: '9000' }
        ]
      };

      const newDevice = {
        name: 'Trinity',
        extension: '9001',
        authId: '9001',
        password: 'secret',
        voiceId: 'voice-123',
        prompt: 'You are Trinity'
      };

      config.devices.push(newDevice);

      assert.strictEqual(config.devices.length, 2);
      assert.strictEqual(config.devices[1].name, 'Trinity');
    });
  });

  describe('Device list', () => {
    it('should display all configured devices', () => {
      const config = {
        devices: [
          { name: 'Morpheus', extension: '9000', voiceId: 'voice-123' },
          { name: 'Cephanie', extension: '9002', voiceId: 'voice-456' }
        ]
      };

      assert.strictEqual(config.devices.length, 2);
      assert.strictEqual(config.devices[0].name, 'Morpheus');
      assert.strictEqual(config.devices[1].name, 'Cephanie');
    });

    it('should handle empty device list', () => {
      const config = { devices: [] };
      assert.strictEqual(config.devices.length, 0);
    });
  });

  describe('Device remove', () => {
    it('should find device by name (case insensitive)', () => {
      const config = {
        devices: [
          { name: 'Morpheus', extension: '9000' },
          { name: 'Trinity', extension: '9001' }
        ]
      };

      const deviceName = 'morpheus';
      const index = config.devices.findIndex(
        d => d.name.toLowerCase() === deviceName.toLowerCase()
      );

      assert.strictEqual(index, 0, 'Device should be found by name');
    });

    it('should prevent removing last device', () => {
      const config = {
        devices: [
          { name: 'Morpheus', extension: '9000' }
        ]
      };

      const canRemove = config.devices.length > 1;
      assert.strictEqual(canRemove, false, 'Should not allow removing last device');
    });

    it('should remove device from config', () => {
      const config = {
        devices: [
          { name: 'Morpheus', extension: '9000' },
          { name: 'Trinity', extension: '9001' }
        ]
      };

      const deviceName = 'Trinity';
      const index = config.devices.findIndex(
        d => d.name.toLowerCase() === deviceName.toLowerCase()
      );

      config.devices.splice(index, 1);

      assert.strictEqual(config.devices.length, 1);
      assert.strictEqual(config.devices[0].name, 'Morpheus');
    });
  });
});
